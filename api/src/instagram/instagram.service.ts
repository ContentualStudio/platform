import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import {
  eventNameTokens,
  followerMilestoneTiers,
  type FollowerMilestoneTier,
} from "@contentual/content-engine-vocabulary";
import { localDateFor, resolveTimezone } from "../common/timezone";
import { ContentEventBatch, dispatchAfterCommit } from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { returnedRows } from "../content-engine/returned-rows";
import { UserProfileEntity } from "../profile/entities/user-profile.entity";
import {
  INSTAGRAM_GRAPH,
  type InstagramGraphAccount,
  type InstagramGraphPort,
} from "./instagram-graph.port";

// Only one platform is wired today; this is an internal constant, not a
// vocabulary token — the payload field it fills is a plain string, not an
// enum.
const PLATFORM = "instagram";

// The longest growth window the analytics screen offers.
const GROWTH_HISTORY_DAYS = 90;

// How many posts each analytics list shows.
const POSTS_PER_LIST = 10;

// At most one live connection per user/platform (the partial unique index
// this targets), so this doubles as the platform.connected emit gate and the
// mint of connectionOrdinal, the discriminator that makes a reconnect a new
// event rather than a replay of the connection it superseded.
const INSERT_CONNECTION_SQL = `
  INSERT INTO "platform_connection"
    ("userId", "platform", "externalAccountId", "username", "connectionOrdinal")
  SELECT $1, $2, $3, $4, COALESCE(MAX("connectionOrdinal"), 0) + 1
  FROM "platform_connection"
  WHERE "userId" = $1 AND "platform" = $2
  ON CONFLICT ("userId", "platform") WHERE "disconnectedAt" IS NULL DO NOTHING
  RETURNING "connectionOrdinal"
`;

// `status` moves with `disconnectedAt` in the same statement, because a CHECK
// constraint pins the two together — they are one fact with two readers, and
// setting either alone is rejected by the database rather than left to drift.
const DISCONNECT_SQL = `
  UPDATE "platform_connection"
     SET "disconnectedAt" = now(),
         "status" = 'disconnected',
         "dataConsent" = false
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
  RETURNING "id"
`;

const HAS_LIVE_CONNECTION_SQL = `
  SELECT 1
  FROM "platform_connection"
  WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
  LIMIT 1
`;

const GET_LIVE_CONNECTION_FOR_ANALYTICS_SQL = `
  SELECT "connectedAt"
  FROM "platform_connection"
  WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
  ORDER BY "connectedAt" DESC
  LIMIT 1
`;

// The latest pull of any kind, metrics or not: a pull for a personal account
// still completes, it just has nothing to report.
const GET_LAST_PULL_SQL = `
  SELECT max("pulledAt") AS "pulledAt"
  FROM "instagram_account_metric"
  WHERE "userId" = $1
`;

// How long after a connect the page treats an absent pull as "still running".
// Past this the pull has failed or stalled, and the sweep will catch up, so
// the page falls back to its ordinary "next daily update" wording.
const INITIAL_SYNC_WINDOW_MS = 10 * 60_000;

const GET_LATEST_SNAPSHOT_SQL = `
  SELECT "localDate", "followerCount"
  FROM "follower_snapshot"
  WHERE "userId" = $1 AND "platform" = $2
  ORDER BY "localDate" DESC, "recordedAt" DESC
  LIMIT 1
`;

// The most recent day the daily pull got account insights for. Insights are
// per day (period=day), so these are "yesterday's" numbers, not totals.
const GET_LATEST_ACCOUNT_METRIC_SQL = `
  SELECT "localDate"::text AS "localDate", "reach", "totalInteractions",
         "views", "profileViews"
  FROM "instagram_account_metric"
  WHERE "userId" = $1 AND "metricsAvailable"
  ORDER BY "localDate" DESC, "pulledAt" DESC
  LIMIT 1
`;

const GET_PREVIOUS_WEEK_SNAPSHOT_SQL = `
  SELECT "followerCount"
  FROM "follower_snapshot"
  WHERE "userId" = $1
    AND "platform" = $2
    AND "localDate" <= ($3::date - INTERVAL '7 days')::date
  ORDER BY "localDate" DESC, "recordedAt" DESC
  LIMIT 1
`;

// The live connection the growth graph is framed by, with the timezone its
// dates are read in.
const GET_GROWTH_CONNECTION_SQL = `
  SELECT c."connectedAt", p."timezone"
    FROM "platform_connection" c
    LEFT JOIN "user_profile" p ON p."userId" = c."userId"
   WHERE c."userId" = $1 AND c."platform" = $2 AND c."disconnectedAt" IS NULL
   ORDER BY c."connectedAt" DESC
   LIMIT 1
`;

// Every snapshot inside the longest window, never earlier than connect day:
// history is not backfilled, and a previous connection's rows are purged on
// disconnect.
const GET_GROWTH_POINTS_SQL = `
  SELECT to_char("localDate", 'YYYY-MM-DD') AS "date", "followerCount" AS "followers"
    FROM "follower_snapshot"
   WHERE "userId" = $1
     AND "platform" = $2
     AND "localDate" > $3::date - ${GROWTH_HISTORY_DAYS}
     AND "localDate" <= $3::date
     AND "localDate" >= $4::date
   ORDER BY "localDate"
`;

// The analytics posts lists, read from each post's current state. Both are
// served by an index on "instagram_post".
const POST_VIEW_COLUMNS = `
  "mediaId" AS "id", "mediaType", "permalink", "postedAt", "caption",
  "thumbnailUrl", "views", "likes", "comments"
`;

const GET_RECENT_POSTS_SQL = `
  SELECT ${POST_VIEW_COLUMNS}
    FROM "instagram_post"
   WHERE "userId" = $1
   ORDER BY "postedAt" DESC NULLS LAST, "mediaId"
   LIMIT $2
`;

const GET_TOP_POSTS_SQL = `
  SELECT ${POST_VIEW_COLUMNS}
    FROM "instagram_post"
   WHERE "userId" = $1 AND "views" IS NOT NULL
   ORDER BY "views" DESC, "postedAt" DESC NULLS LAST, "mediaId"
   LIMIT $2
`;

// One authoritative reading per user/platform/day — a re-sync the same day
// overwrites it rather than accumulating history.
const UPSERT_SNAPSHOT_SQL = `
  INSERT INTO "follower_snapshot" ("userId", "platform", "localDate", "followerCount")
  VALUES ($1, $2, $3::date, $4)
  ON CONFLICT ("userId", "platform", "localDate")
  DO UPDATE SET "followerCount" = EXCLUDED."followerCount", "recordedAt" = now()
`;

// One statement for every tier this sync crosses. A tier already reached
// (from a prior sync, on any platform) is excluded by the emit gate itself —
// no separate check needed.
const INSERT_MILESTONES_SQL = `
  INSERT INTO "follower_milestone" ("userId", "platform", "tier", "followerCount")
  SELECT $1, $2, "tier", $4
  FROM unnest($3::int[]) AS "tier"
  ON CONFLICT ("userId", "tier") DO NOTHING
  RETURNING "tier"
`;

/**
 * Where the account facts come from.
 *
 * A caller that has already read the account — the OAuth callback, the daily
 * pull — hands it over rather than paying for a second `/me` round trip. The
 * `credential` arm is the stub descriptor the local harness and the demo
 * script use, and is the only place a caller-supplied secret can enter.
 */
export type InstagramAccountSource =
  | { readonly account: InstagramGraphAccount }
  | { readonly credential: string };

export interface ConnectInstagramResult {
  readonly connected: boolean;
}

export interface DisconnectInstagramResult {
  readonly disconnected: boolean;
}

export interface SyncFollowersResult {
  readonly reachedTiers: readonly number[];
}

export interface AnalyticsSnapshotResult {
  readonly connected: boolean;
  /**
   * True while the first pull after a connect is still running: connected in
   * the last few minutes and no pull completed since. Lets the analytics page
   * say "pulling your data" and refresh, instead of reading as empty.
   */
  readonly syncing: boolean;
  readonly snapshot: {
    readonly followers: number;
    readonly followerDeltaWeek: number | null;
    readonly connectedSince: string;
    /**
     * The latest day's account insights; null until the first daily pull
     * returns them. Each metric is null when Instagram did not report it.
     */
    readonly latestDay: {
      readonly localDate: string;
      readonly reach: number | null;
      readonly interactions: number | null;
      readonly views: number | null;
      readonly profileViews: number | null;
    } | null;
  } | null;
}

export interface FollowerGrowthPoint {
  readonly date: string;
  readonly followers: number;
}

export type FollowerGrowthResult =
  | { readonly connected: false }
  | {
      readonly connected: true;
      /** The user's local date; the client measures its windows back from it. */
      readonly today: string;
      readonly points: readonly FollowerGrowthPoint[];
    };

export interface InstagramPostView {
  readonly id: string;
  readonly mediaType: string | null;
  readonly permalink: string | null;
  /** A Date on the way out; Nest serialises it as an ISO string. */
  readonly postedAt: Date | null;
  readonly caption: string | null;
  readonly thumbnailUrl: string | null;
  /** Null when Meta did not report the metric; never invented as zero. */
  readonly views: number | null;
  readonly likes: number | null;
  readonly comments: number | null;
}

export type InstagramPostsResult =
  | { readonly connected: false }
  | {
      readonly connected: true;
      /** Newest first. */
      readonly recent: readonly InstagramPostView[];
      /** Most viewed first; posts with no view count are left out. */
      readonly top: readonly InstagramPostView[];
    };

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: ContentEventEmitter,
    private readonly eventDispatcher: ContentEventDispatcher,
    @Inject(INSTAGRAM_GRAPH) private readonly graph: InstagramGraphPort,
  ) {}

  async connect(
    userId: string,
    source: InstagramAccountSource,
  ): Promise<ConnectInstagramResult> {
    // A network call in the real adapter — must not hold the fact
    // transaction open while it runs, the same reasoning the evaluator's
    // post-commit dispatch follows.
    const account = await this.resolveAccount(userId, source);

    const batch = new ContentEventBatch();

    const connected = await this.dataSource.transaction(async (manager) => {
      const [inserted] = returnedRows<{ connectionOrdinal: number }>(
        await manager.query(INSERT_CONNECTION_SQL, [
          userId,
          PLATFORM,
          account.externalAccountId,
          account.username,
        ]),
      );

      if (inserted) {
        const connectedEvent = await this.eventEmitter.emit(manager, {
          eventId: contentEventIds.platformConnected({
            userId: userId,
            platform: PLATFORM,
            connectionOrdinal: inserted.connectionOrdinal,
          }),
          eventName: eventNameTokens.platformConnected,
          payload: { userId: userId, platform: PLATFORM },
        });
        batch.add(connectedEvent.id);
      }

      // Always runs, whether this connect started a new connection or
      // refreshed an already-live one — the caller just fetched a real
      // follower count either way, and a redundant connect() call is the
      // only path that would otherwise let it go unsynced.
      await this.recordFollowerSync(
        manager,
        batch,
        userId,
        await this.localDateForUser(manager, userId),
        account.followerCount,
      );

      return Boolean(inserted);
    });

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return { connected };
  }

  // No event: the vocabulary has no platform.disconnected. This exists so
  // connectionOrdinal stays meaningful and a reconnect legitimately re-emits
  // platform.connected.
  async disconnect(userId: string): Promise<DisconnectInstagramResult> {
    const disconnected = returnedRows<{ id: string }>(
      await this.dataSource.query(DISCONNECT_SQL, [userId, PLATFORM]),
    );

    return { disconnected: disconnected.length > 0 };
  }

  async syncFollowers(
    userId: string,
    source: InstagramAccountSource,
  ): Promise<SyncFollowersResult> {
    // An early, best-effort check so a plainly-disconnected caller fails
    // before paying for the network call below; the check that actually
    // gates the write happens again inside the transaction, since a
    // disconnect landing between this check and the write would otherwise
    // let a snapshot be written for a dead connection.
    const [live] = (await this.dataSource.query(HAS_LIVE_CONNECTION_SQL, [
      userId,
      PLATFORM,
    ])) as unknown[];

    if (!live) {
      throw new BadRequestException({
        code: "PLATFORM_NOT_CONNECTED",
        message: "Connect Instagram before syncing followers.",
      });
    }

    const account = await this.resolveAccount(userId, source);

    const batch = new ContentEventBatch();
    let reachedTiers: readonly number[] = [];

    await this.dataSource.transaction(async (manager) => {
      const [stillLive] = (await manager.query(HAS_LIVE_CONNECTION_SQL, [
        userId,
        PLATFORM,
      ])) as unknown[];

      if (!stillLive) {
        throw new BadRequestException({
          code: "PLATFORM_NOT_CONNECTED",
          message: "Connect Instagram before syncing followers.",
        });
      }

      reachedTiers = await this.recordFollowerSync(
        manager,
        batch,
        userId,
        await this.localDateForUser(manager, userId),
        account.followerCount,
      );
    });

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return { reachedTiers };
  }

  private async resolveAccount(
    userId: string,
    source: InstagramAccountSource,
  ): Promise<InstagramGraphAccount> {
    return "account" in source
      ? source.account
      : this.graph.fetchAccount({ userId, credential: source.credential });
  }

  async getAnalyticsSnapshot(
    userId: string,
  ): Promise<AnalyticsSnapshotResult> {
    const [connection] = returnedRows<{ connectedAt: Date | string }>(
      await this.dataSource.query(GET_LIVE_CONNECTION_FOR_ANALYTICS_SQL, [
        userId,
        PLATFORM,
      ]),
    );

    if (!connection) {
      return { connected: false, syncing: false, snapshot: null };
    }

    const [latestResult, lastPullResult] = await Promise.all([
      this.dataSource.query(GET_LATEST_SNAPSHOT_SQL, [userId, PLATFORM]),
      this.dataSource.query(GET_LAST_PULL_SQL, [userId]),
    ]);
    const [latest] = returnedRows<{
      localDate: string;
      followerCount: number;
    }>(latestResult);
    const [lastPull] = returnedRows<{ pulledAt: Date | string | null }>(
      lastPullResult,
    );
    const syncing = initialSyncPending(
      new Date(connection.connectedAt),
      lastPull?.pulledAt ? new Date(lastPull.pulledAt) : null,
      new Date(),
    );

    if (!latest) {
      return { connected: true, syncing, snapshot: null };
    }

    const [previousWeekResult, latestDayResult] = await Promise.all([
      this.dataSource.query(GET_PREVIOUS_WEEK_SNAPSHOT_SQL, [
        userId,
        PLATFORM,
        latest.localDate,
      ]),
      this.dataSource.query(GET_LATEST_ACCOUNT_METRIC_SQL, [userId]),
    ]);
    const [previousWeek] = returnedRows<{ followerCount: number }>(previousWeekResult);
    const [latestDay] = returnedRows<{
      localDate: string;
      reach: number | null;
      totalInteractions: number | null;
      views: number | null;
      profileViews: number | null;
    }>(latestDayResult);

    return {
      connected: true,
      syncing,
      snapshot: {
        followers: latest.followerCount,
        followerDeltaWeek: previousWeek
          ? latest.followerCount - previousWeek.followerCount
          : null,
        connectedSince: new Date(connection.connectedAt).toISOString(),
        latestDay: latestDay
          ? {
              localDate: latestDay.localDate,
              reach: latestDay.reach,
              interactions: latestDay.totalInteractions,
              views: latestDay.views,
              profileViews: latestDay.profileViews,
            }
          : null,
      },
    };
  }

  /**
   * Follower history for the growth graph: up to the last 90 local days, from
   * connect day forward, oldest first. The client slices it into the 7/30/90
   * windows and computes each window's change, so switching windows is free.
   */
  async getFollowerGrowth(userId: string): Promise<FollowerGrowthResult> {
    const [connection] = returnedRows<{
      connectedAt: Date | string;
      timezone: string | null;
    }>(
      await this.dataSource.query(GET_GROWTH_CONNECTION_SQL, [userId, PLATFORM]),
    );

    if (!connection) {
      return { connected: false };
    }

    const timezone = resolveTimezone(connection.timezone);
    const today = localDateFor(new Date(), timezone);
    const connectDay = localDateFor(new Date(connection.connectedAt), timezone);

    const points = returnedRows<FollowerGrowthPoint>(
      await this.dataSource.query(GET_GROWTH_POINTS_SQL, [
        userId,
        PLATFORM,
        today,
        connectDay,
      ]),
    );

    return { connected: true, today, points };
  }

  /** The analytics posts lists, read from stored post data only. */
  async getPosts(userId: string): Promise<InstagramPostsResult> {
    const [connections, recent, top] = await Promise.all([
      this.dataSource.query(GET_LIVE_CONNECTION_FOR_ANALYTICS_SQL, [userId, PLATFORM]),
      this.dataSource.query(GET_RECENT_POSTS_SQL, [userId, POSTS_PER_LIST]),
      this.dataSource.query(GET_TOP_POSTS_SQL, [userId, POSTS_PER_LIST]),
    ]);

    if (returnedRows(connections).length === 0) {
      return { connected: false };
    }

    return {
      connected: true,
      recent: returnedRows<InstagramPostView>(recent),
      top: returnedRows<InstagramPostView>(top),
    };
  }

  private async localDateForUser(
    manager: EntityManager,
    userId: string,
  ): Promise<string> {
    const profile = await manager.findOneBy(UserProfileEntity, { userId });
    return localDateFor(new Date(), profile?.timezone ?? "UTC");
  }

  // Upserts the day's snapshot (not a gate — always overwritten) then reports
  // every tier this follower count newly crosses, ascending. Called from both
  // connect() (so a connect carrying a count emits its milestones too) and
  // syncFollowers().
  private async recordFollowerSync(
    manager: EntityManager,
    batch: ContentEventBatch,
    userId: string,
    localDate: string,
    followerCount: number,
  ): Promise<readonly number[]> {
    await manager.query(UPSERT_SNAPSHOT_SQL, [
      userId,
      PLATFORM,
      localDate,
      followerCount,
    ]);

    const crossedTiers = followerMilestoneTiers.filter(
      (tier) => tier <= followerCount,
    );

    if (crossedTiers.length === 0) {
      return [];
    }

    const rows = returnedRows<{ tier: number }>(
      await manager.query(INSERT_MILESTONES_SQL, [
        userId,
        PLATFORM,
        crossedTiers,
        followerCount,
      ]),
    );

    const reachedTiers = rows.map((row) => row.tier).sort((a, b) => a - b);

    for (const tier of reachedTiers) {
      const event = await this.eventEmitter.emit(manager, {
        eventId: contentEventIds.followerMilestone({ userId, tier }),
        eventName: eventNameTokens.followerMilestone,
        payload: {
          userId,
          tier: tier as FollowerMilestoneTier,
          followerCount,
        },
      });
      batch.add(event.id);
    }

    return reachedTiers;
  }
}

/**
 * Whether the pull a connect starts is still outstanding: the connection is
 * recent and nothing has been pulled since it was made. A reconnect counts as
 * a fresh connection, so rows from an earlier one do not end the wait.
 */
export function initialSyncPending(
  connectedAt: Date,
  lastPulledAt: Date | null,
  now: Date,
): boolean {
  const recentlyConnected =
    now.getTime() - connectedAt.getTime() < INITIAL_SYNC_WINDOW_MS;
  const pulledSinceConnect =
    lastPulledAt !== null && lastPulledAt.getTime() >= connectedAt.getTime();

  return recentlyConnected && !pulledSinceConnect;
}
