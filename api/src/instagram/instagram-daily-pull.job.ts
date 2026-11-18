import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  previousLocalDate,
  resolveTimezone,
  startOfLocalDay,
} from "../common/timezone";
import { returnedRows } from "../content-engine/returned-rows";
import type { SweepJob } from "../scheduling/sweep-job.port";
import {
  INSTAGRAM_API,
  type InsightsRange,
  type InstagramAccount,
  type InstagramAccountInsights,
  type InstagramApiPort,
  type InstagramMediaMetric,
  type InstagramResult,
} from "./instagram-api.port";
import {
  ConsentRequiredError,
  type InstagramConnectionView,
  InstagramTokenService,
  NoLiveConnectionError,
  PLATFORM,
  TokenUnusableError,
} from "./instagram-token.service";
import { isRefreshEligible } from "./token-lifecycle";
import { InstagramService } from "./instagram.service";

/**
 * The per-user daily work: refresh the token if it is old enough, read the
 * account and its metrics, and write the day's rows.
 *
 * Registered as a sweep job rather than owning a timer, so it runs at roughly
 * 7am in each user's own timezone and shares its scheduling with everything
 * else that has to happen daily.
 *
 * Two things this deliberately does *not* do:
 *
 *   - It does not reimplement the follower snapshot or the milestone emit.
 *     `InstagramService.syncFollowers` already owns both, including the
 *     conditional insert that gates `follower.milestone`. Calling it keeps one
 *     write path for follower data instead of two that must agree.
 *   - It does not treat a missing metric as a failure. A personal account or
 *     one under the follower gate legitimately returns nothing, and the run
 *     writes what it has and moves on.
 */
const USER_TIMEZONE_SQL = `
  SELECT "timezone" FROM "user_profile" WHERE "userId" = $1
`;

const UPSERT_ACCOUNT_METRIC_SQL = `
  INSERT INTO "instagram_account_metric"
    ("userId", "localDate", "followerCount", "reach", "totalInteractions",
     "profileLinksTaps", "views", "profileViews", "metricsAvailable")
  VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT ("userId", "localDate") DO UPDATE SET
    "followerCount" = EXCLUDED."followerCount",
    "reach" = EXCLUDED."reach",
    "totalInteractions" = EXCLUDED."totalInteractions",
    "profileLinksTaps" = EXCLUDED."profileLinksTaps",
    "views" = EXCLUDED."views",
    "profileViews" = EXCLUDED."profileViews",
    "metricsAvailable" = EXCLUDED."metricsAvailable",
    "pulledAt" = now()
`;

// One statement for the whole page of media rather than one per post. Meta
// returns up to 25, and 25 sequential round trips per user per day is the
// job's largest avoidable cost.
const UPSERT_POST_METRICS_SQL = `
  INSERT INTO "instagram_post_metric"
    ("userId", "mediaId", "localDate", "mediaType", "permalink", "postedAt",
     "views", "reach", "likes", "comments", "shares", "saved")
  SELECT $1, "mediaId", $2::date, "mediaType", "permalink", "postedAt",
         "views", "reach", "likes", "comments", "shares", "saved"
  FROM unnest(
    $3::text[], $4::text[], $5::text[], $6::timestamptz[],
    $7::int[], $8::int[], $9::int[], $10::int[], $11::int[], $12::int[]
  ) AS t("mediaId", "mediaType", "permalink", "postedAt",
         "views", "reach", "likes", "comments", "shares", "saved")
  ON CONFLICT ("userId", "mediaId", "localDate") DO UPDATE SET
    "mediaType" = EXCLUDED."mediaType",
    "permalink" = EXCLUDED."permalink",
    "postedAt" = EXCLUDED."postedAt",
    "views" = EXCLUDED."views",
    "reach" = EXCLUDED."reach",
    "likes" = EXCLUDED."likes",
    "comments" = EXCLUDED."comments",
    "shares" = EXCLUDED."shares",
    "saved" = EXCLUDED."saved",
    "pulledAt" = now()
`;

const RECORD_ACCOUNT_TYPE_SQL = `
  UPDATE "platform_connection"
     SET "accountType" = $3, "lastAccountTypeCheckAt" = now()
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
`;

// Only users with a live, consented Instagram connection are enqueued at all,
// so the sweep does not create a row per user per day for people who have never
// connected. A build-time constant, never caller input.
const SCOPE_SQL = `
  EXISTS (
    SELECT 1 FROM "platform_connection" c
     WHERE c."userId" = p."userId"
       AND c."platform" = 'instagram'
       AND c."disconnectedAt" IS NULL
       AND c."dataConsent" = true
       AND c."status" = 'connected'
  )
`;

// Each post's current state: identity plus its latest numbers. Upserted from
// the same page of media, so a post's caption and image link are stored once
// and refreshed whenever the post is in the newest page Meta returns.
const UPSERT_POSTS_SQL = `
  INSERT INTO "instagram_post"
    ("userId", "mediaId", "mediaType", "permalink", "postedAt", "caption",
     "thumbnailUrl", "views", "likes", "comments")
  SELECT $1, "mediaId", "mediaType", "permalink", "postedAt", "caption",
         "thumbnailUrl", "views", "likes", "comments"
  FROM unnest(
    $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::text[],
    $7::text[], $8::int[], $9::int[], $10::int[]
  ) AS t("mediaId", "mediaType", "permalink", "postedAt", "caption",
         "thumbnailUrl", "views", "likes", "comments")
  ON CONFLICT ("userId", "mediaId") DO UPDATE SET
    "mediaType" = EXCLUDED."mediaType",
    "permalink" = EXCLUDED."permalink",
    "postedAt" = EXCLUDED."postedAt",
    "caption" = EXCLUDED."caption",
    "thumbnailUrl" = EXCLUDED."thumbnailUrl",
    "views" = EXCLUDED."views",
    "likes" = EXCLUDED."likes",
    "comments" = EXCLUDED."comments",
    "updatedAt" = now()
`;

@Injectable()
export class InstagramDailyPullJob implements SweepJob {
  readonly name = "instagram.daily-pull";
  readonly scopeSql = SCOPE_SQL;

  private readonly logger = new Logger(InstagramDailyPullJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: InstagramTokenService,
    private readonly instagram: InstagramService,
    @Inject(INSTAGRAM_API) private readonly api: InstagramApiPort,
  ) {}

  async run(userId: string, localDate: string): Promise<"succeeded" | "skipped"> {
    const connection = await this.tokens.getConnection(userId);

    // All three are ordinary states, not errors: the user withdrew consent,
    // disconnected, or needs to reauthorise. Skipping is the correct outcome
    // and must not be retried.
    if (
      !connection ||
      !connection.dataConsent ||
      connection.status !== "connected"
    ) {
      return "skipped";
    }

    if (!(await this.refreshIfEligible(userId, connection))) {
      return "skipped";
    }

    try {
      return await this.pull(userId, localDate);
    } catch (error) {
      if (
        error instanceof TokenUnusableError ||
        error instanceof ConsentRequiredError ||
        error instanceof NoLiveConnectionError
      ) {
        return "skipped";
      }

      throw error;
    }
  }

  /**
   * Refreshes when Meta will accept it, which is once the token is 24 hours
   * old. Returns false when the run should not continue.
   */
  private async refreshIfEligible(
    userId: string,
    connection: InstagramConnectionView,
  ): Promise<boolean> {
    const timestamps = await this.tokens.readTimestamps(userId);

    if (!timestamps || !isRefreshEligible(timestamps, new Date())) {
      return true;
    }

    const refreshed = await this.tokens.withAccessToken(userId, (accessToken) =>
      this.api.refreshToken(accessToken),
    );

    if (refreshed.ok) {
      await this.tokens.storeToken({
        userId,
        connectionId: connection.connectionId,
        accessToken: refreshed.value.accessToken,
        expiresInSeconds: refreshed.value.expiresInSeconds,
        scopes: connection.scopes.length
          ? connection.scopes
          : ["instagram_business_basic"],
      });

      return true;
    }

    if (refreshed.kind === "auth") {
      // Dead or revoked. The user has to reauthorise, and until they do there
      // is nothing to pull — surfaced as a prompt rather than a silent stall.
      await this.tokens.setStatus(userId, "reconnect_required");
      return false;
    }

    // Transient. The existing token is still valid, so carry on and let
    // tomorrow's sweep refresh it.
    return true;
  }

  private async pull(
    userId: string,
    localDate: string,
  ): Promise<"succeeded" | "skipped"> {
    const account = await this.tokens.withAccessToken(userId, (accessToken) =>
      this.api.fetchAccount(accessToken),
    );

    if (!account.ok) {
      if (account.kind === "auth") {
        await this.tokens.setStatus(userId, "reconnect_required");
        return "skipped";
      }

      throw new Error(`Instagram account read failed: ${account.error}`);
    }

    await this.dataSource.query(RECORD_ACCOUNT_TYPE_SQL, [
      userId,
      PLATFORM,
      account.value.accountType,
    ]);

    // A downgrade to personal stops insights at the source. Recorded and
    // surfaced as a reconnect prompt, but not an error: the follower count is
    // still readable and still worth storing.
    if (account.value.accountType === "personal") {
      await this.tokens.setStatus(userId, "reconnect_required");
      await this.writeAccountMetric(userId, localDate, account.value.followerCount, null);
      await this.syncFollowers(userId, account.value);

      return "succeeded";
    }

    // Account insights are read for the last *completed* local day. Asked
    // without a window, Meta answers for the day in progress, which at 7am -
    // or minutes after a connect - is close to zero and would be stored as the
    // day's result.
    const reported = await this.lastCompletedDay(userId, localDate);

    // Two independent reads on one token load, in flight together: neither
    // needs the other's answer, and running them in series doubled the job's
    // per-user wall time.
    const [insights, media] = await this.tokens.withAccessToken(
      userId,
      (accessToken) =>
        Promise.all([
          this.api.fetchAccountInsights(
            accessToken,
            account.value.externalAccountId,
            reported.range,
          ),
          this.api.fetchMediaWithInsights(accessToken),
        ]),
    );

    if (!insights.ok && insights.kind !== "permission") {
      throw new Error(`Instagram insights read failed: ${insights.error}`);
    }

    // The metrics are filed under the day they describe, which is what the
    // analytics caption names ("for 13 Oct, the latest day Instagram
    // reported"). The follower count rides along as read now; the follower
    // history itself is the snapshot syncFollowers writes for today.
    await this.writeAccountMetric(
      userId,
      insights.ok ? reported.localDate : localDate,
      account.value.followerCount,
      insights.ok ? insights.value : null,
    );

    await this.writePostMetrics(userId, localDate, media);
    await this.syncFollowers(userId, account.value);

    return "succeeded";
  }

  /** The local day before `localDate`, and its bounds in the user's timezone. */
  private async lastCompletedDay(
    userId: string,
    localDate: string,
  ): Promise<{ localDate: string; range: InsightsRange }> {
    const [profile] = returnedRows<{ timezone: string | null }>(
      await this.dataSource.query(USER_TIMEZONE_SQL, [userId]),
    );
    const timezone = resolveTimezone(profile?.timezone ?? null);
    const yesterday = previousLocalDate(localDate);

    return {
      localDate: yesterday,
      range: {
        since: startOfLocalDay(yesterday, timezone),
        until: startOfLocalDay(localDate, timezone),
      },
    };
  }

  private async writeAccountMetric(
    userId: string,
    localDate: string,
    followerCount: number,
    insights: InstagramAccountInsights | null,
  ): Promise<void> {
    await this.dataSource.query(UPSERT_ACCOUNT_METRIC_SQL, [
      userId,
      localDate,
      followerCount,
      insights?.reach ?? null,
      insights?.totalInteractions ?? null,
      insights?.profileLinksTaps ?? null,
      insights?.views ?? null,
      insights?.profileViews ?? null,
      insights !== null,
    ]);
  }

  private async writePostMetrics(
    userId: string,
    localDate: string,
    media: InstagramResult<readonly InstagramMediaMetric[]>,
  ): Promise<void> {
    if (!media.ok) {
      if (media.kind === "permission") {
        return;
      }

      throw new Error(`Instagram media read failed: ${media.error}`);
    }

    if (media.value.length === 0) {
      return;
    }

    const column = <T>(read: (post: InstagramMediaMetric) => T) =>
      media.value.map(read);

    await this.dataSource.query(UPSERT_POST_METRICS_SQL, [
      userId,
      localDate,
      column((post) => post.mediaId),
      column((post) => post.mediaType),
      column((post) => post.permalink),
      column((post) => post.postedAt),
      column((post) => post.views),
      column((post) => post.reach),
      column((post) => post.likes),
      column((post) => post.comments),
      column((post) => post.shares),
      column((post) => post.saved),
    ]);

    await this.dataSource.query(UPSERT_POSTS_SQL, [
      userId,
      column((post) => post.mediaId),
      column((post) => post.mediaType),
      column((post) => post.permalink),
      column((post) => post.postedAt),
      column((post) => post.caption),
      column((post) => post.thumbnailUrl),
      column((post) => post.views),
      column((post) => post.likes),
      column((post) => post.comments),
    ]);
  }

  /**
   * Delegates the follower snapshot and its milestones to the existing write
   * path, so the `follower.milestone` emit gate stays in one place.
   *
   * The account this run already read is handed over, so the snapshot costs no
   * second `/me` call and no second token load.
   */
  private async syncFollowers(
    userId: string,
    account: InstagramAccount,
  ): Promise<void> {
    await this.instagram.syncFollowers(userId, { account });
  }
}
