import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import { INSTAGRAM_API, type InstagramApiPort } from "./instagram-api.port";
import { InstagramTokenService, PLATFORM } from "./instagram-token.service";

/**
 * The one cascade that erases a user's Instagram data.
 *
 * Both deletion routes call it — the in-app disconnect and Meta's data-deletion
 * callback — so the two cannot drift into deleting different things. A user who
 * asks us and a user whose platform asks on their behalf get the same result.
 *
 * Two modes, because the routes differ in one respect:
 *
 *   - `disconnect` keeps the `platform_connection` row. It mints
 *     `connectionOrdinal`, which is a segment of the `platform.connected`
 *     stable event id; dropping it would reset the ordinal to 1 and make the
 *     user's next connect rebuild an id that was already delivered — the
 *     outbox would treat a real reconnection as a replay and drop it.
 *   - `erase` deletes the row. Meta's callback is a legal erasure request, and
 *     the ordinal reset is acceptable because that user's history is going
 *     anyway.
 *
 * Idempotent throughout: every statement is a `DELETE ... WHERE`, so a failed
 * run can simply be run again.
 */
export type PurgeMode = "disconnect" | "erase";

export interface PurgeResult {
  readonly tokenRevoked: boolean;
  readonly rowsDeleted: number;
}

// Ordered deliberately. The credential goes first so that if anything after it
// fails, what is left behind is data — never a working key to someone's
// Instagram account.
const DELETE_POST_METRICS_SQL = `DELETE FROM "instagram_post_metric" WHERE "userId" = $1`;
const DELETE_POSTS_SQL = `DELETE FROM "instagram_post" WHERE "userId" = $1`;
const DELETE_ACCOUNT_METRICS_SQL = `DELETE FROM "instagram_account_metric" WHERE "userId" = $1`;

const DELETE_SNAPSHOTS_SQL = `
  DELETE FROM "follower_snapshot" WHERE "userId" = $1 AND "platform" = $2
`;

// Only this platform's rows. `follower_milestone` is keyed (userId, tier) with
// no platform, deliberately — the vocabulary's payload has no platform field,
// so crossing 100 followers on two platforms is one event. Filtering by
// platform is correct while Instagram is the only one; whoever adds the second
// has to decide what a shared tier means on erasure.
const DELETE_MILESTONES_SQL = `
  DELETE FROM "follower_milestone" WHERE "userId" = $1 AND "platform" = $2
`;

/**
 * Follower-derived badges, identified by provenance rather than by name.
 *
 * `user_achievement` records the `eventId` that awarded it, and event ids are
 * built as `<eventName>:<segments>`. Joining to the outbox on that id and
 * filtering by `eventName` is what distinguishes a badge earned from follower
 * growth from one earned by completing tasks — which must survive. A naming
 * convention on `badgeId` would be a guess; this is the actual fact.
 */
const DELETE_FOLLOWER_ACHIEVEMENTS_SQL = `
  DELETE FROM "user_achievement" a
   WHERE a."userId" = $1
     AND EXISTS (
       SELECT 1 FROM "content_engine_events" e
        WHERE e."id" = a."eventId" AND e."eventName" = $2
     )
`;

const DELETE_FOLLOWER_COOLDOWNS_SQL = `
  DELETE FROM "badge_cooldown_queue" q
   WHERE q."userId" = $1
     AND EXISTS (
       SELECT 1 FROM "content_engine_events" e
        WHERE e."id" = q."eventId" AND e."eventName" = $2
     )
`;

/**
 * The firing ledger's reservations for those events.
 *
 * Necessary, not housekeeping: the ledger is what makes a replayed event a
 * no-op, keyed on (ruleId, userId, scopeKey). Leaving these rows behind would
 * mean a user who reconnects and crosses 100 followers again gets nothing,
 * because the ledger still believes that rule already fired for them.
 */
const DELETE_FOLLOWER_LEDGER_SQL = `
  DELETE FROM "engine_firing_ledger" l
   WHERE l."userId" = $1
     AND EXISTS (
       SELECT 1 FROM "content_engine_events" e
        WHERE e."id" = l."eventRef" AND e."eventName" = $2
     )
`;

/**
 * The events themselves.
 *
 * Also necessary rather than tidy: ids are `follower.milestone:<userId>:<tier>`,
 * so a re-crossed tier after a reconnect would rebuild an id the outbox already
 * holds and be dropped as a duplicate. Erasing them restores a clean baseline,
 * which is what "reconnecting starts fresh" actually requires.
 */
const DELETE_FOLLOWER_EVENTS_SQL = `
  DELETE FROM "content_engine_events" WHERE "userId" = $1 AND "eventName" = $2
`;

const DELETE_OAUTH_STATE_SQL = `
  DELETE FROM "instagram_oauth_state" WHERE "userId" = $1
`;

const DISCONNECT_CONNECTION_SQL = `
  UPDATE "platform_connection"
     SET "disconnectedAt" = now(),
         "status" = 'disconnected',
         "dataConsent" = false,
         "accountType" = NULL
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
`;

const DELETE_CONNECTIONS_SQL = `
  DELETE FROM "platform_connection" WHERE "userId" = $1 AND "platform" = $2
`;

@Injectable()
export class InstagramDataPurgeService {
  private readonly logger = new Logger(InstagramDataPurgeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: InstagramTokenService,
    @Inject(INSTAGRAM_API) private readonly api: InstagramApiPort,
  ) {}

  async purge(userId: string, mode: PurgeMode): Promise<PurgeResult> {
    const tokenRevoked = await this.revokeBestEffort(userId);

    const rowsDeleted = await this.dataSource.transaction(async (manager) => {
      // First, and inside the transaction: after this statement commits there
      // is no key to the user's account left, whatever happens next. Delegated
      // rather than hand-written, so the token service stays the only owner of
      // the credential table.
      let deleted = await this.tokens.deleteCredential(userId, manager);

      deleted += await this.run(manager, DELETE_POST_METRICS_SQL, [userId]);
      deleted += await this.run(manager, DELETE_POSTS_SQL, [userId]);
      deleted += await this.run(manager, DELETE_ACCOUNT_METRICS_SQL, [userId]);
      deleted += await this.run(manager, DELETE_SNAPSHOTS_SQL, [userId, PLATFORM]);
      deleted += await this.run(manager, DELETE_MILESTONES_SQL, [userId, PLATFORM]);

      const milestone = eventNameTokens.followerMilestone;

      // Achievements and cooldowns before the events they point at: both are
      // identified by joining to the outbox, so deleting the events first would
      // leave them unidentifiable.
      deleted += await this.run(manager, DELETE_FOLLOWER_ACHIEVEMENTS_SQL, [
        userId,
        milestone,
      ]);
      deleted += await this.run(manager, DELETE_FOLLOWER_COOLDOWNS_SQL, [
        userId,
        milestone,
      ]);
      deleted += await this.run(manager, DELETE_FOLLOWER_LEDGER_SQL, [
        userId,
        milestone,
      ]);
      deleted += await this.run(manager, DELETE_FOLLOWER_EVENTS_SQL, [
        userId,
        milestone,
      ]);

      deleted += await this.run(manager, DELETE_OAUTH_STATE_SQL, [userId]);

      deleted += await this.run(
        manager,
        mode === "erase" ? DELETE_CONNECTIONS_SQL : DISCONNECT_CONNECTION_SQL,
        [userId, PLATFORM],
      );

      return deleted;
    });

    return { tokenRevoked, rowsDeleted };
  }

  /**
   * Asks Meta to drop the grant, and carries on regardless.
   *
   * Best effort on purpose: revocation is not reliably available on Instagram
   * Login, and the promise we can actually keep is destroying our own copy. A
   * failure here must not stop the deletion the user asked for.
   */
  private async revokeBestEffort(userId: string): Promise<boolean> {
    try {
      const result = await this.tokens.withAccessToken(userId, (accessToken) =>
        this.api.revoke(accessToken),
      );

      return result.ok;
    } catch (error) {
      this.logger.warn(
        `Instagram token revocation skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return false;
    }
  }

  private async run(
    manager: EntityManager,
    sql: string,
    params: readonly unknown[],
  ): Promise<number> {
    const result = (await manager.query(sql, [...params])) as unknown;

    // Postgres returns [rows, affectedCount] for a DELETE with no RETURNING.
    return Array.isArray(result) && typeof result[1] === "number" ? result[1] : 0;
  }
}
