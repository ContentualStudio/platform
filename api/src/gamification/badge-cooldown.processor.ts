import { Injectable, Logger } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import { NotificationsService } from "../notifications/notifications.service";
import { scrubbedMessage } from "../observability/scrub-secrets";

/**
 * Releases queued badge celebrations, at most one per user per 24 hours.
 *
 * `AwardBadgeHandler` only enqueues: the achievement is the user's the moment
 * it is awarded, but the *moment* — the takeover and the badge notification —
 * waits here. Two badges unlocked the same afternoon are celebrated a day apart
 * rather than stacked on top of each other.
 *
 * Safe on any number of replicas, and safe to run twice:
 *
 *   - Each user is released under a transaction-scoped advisory lock, and the
 *     24-hour check is re-read *inside* it. Two workers cannot both see "no
 *     release yet today" for the same user, so two same-day badges can never
 *     both pass.
 *   - The release is a guarded `status = 'queued'` update, and the handoff to
 *     Notifications is deduped on the queue row. A replay changes nothing.
 *   - `try` rather than a blocking lock: a user another worker is already
 *     releasing is simply skipped this tick, not waited on.
 */

// Namespaces the advisory lock so it cannot collide with any other feature that
// later takes a two-key advisory lock on a user id.
const LOCK_NAMESPACE = "badge_cooldown_queue";

// The cooldown rule, in one place. `userRef` is the SQL expression naming the
// user: a column in the shortlist, a bound parameter under the lock.
function releasedWithinCooldown(userRef: string): string {
  return `
    EXISTS (
      SELECT 1 FROM "badge_cooldown_queue" r
       WHERE r."userId" = ${userRef}
         AND r."status" = 'released'
         AND r."releasedAt" > now() - interval '24 hours'
    )
  `;
}

// Users with something queued and no release inside the cooldown window. Only
// a shortlist, so a user still cooling down costs no transaction; the check
// that decides is repeated under the lock.
const CANDIDATE_USERS_SQL = `
  SELECT DISTINCT q."userId"
    FROM "badge_cooldown_queue" q
   WHERE q."status" = 'queued'
     AND NOT ${releasedWithinCooldown(`q."userId"`)}
   LIMIT $1
`;

const TRY_LOCK_SQL = `
  SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS "locked"
`;

const IN_COOLDOWN_SQL = `SELECT ${releasedWithinCooldown("$1")} AS "cooling"`;

// Oldest first, so a backlog drains in the order it was earned.
const NEXT_QUEUED_SQL = `
  SELECT q."id", q."ruleId", q."eventId", b."name", b."description", b."active"
    FROM "badge_cooldown_queue" q
    LEFT JOIN "engine_badges" b ON b."sourceDocumentId" = q."badgeId"
   WHERE q."userId" = $1 AND q."status" = 'queued'
   ORDER BY q."enqueuedAt", q."id"
   LIMIT 1
`;

function setStatusSql(status: "released" | "suppressed"): string {
  const releasedAt = status === "released" ? `, "releasedAt" = now()` : "";
  return `
    UPDATE "badge_cooldown_queue"
       SET "status" = '${status}'${releasedAt}
     WHERE "id" = $1 AND "userId" = $2 AND "status" = 'queued'
  `;
}

const RELEASE_SQL = setStatusSql("released");
const SUPPRESS_SQL = setStatusSql("suppressed");

interface QueuedRow {
  id: string;
  ruleId: string;
  eventId: string;
  name: string | null;
  description: string | null;
  active: boolean | null;
}

export interface BadgeCooldownSummary {
  readonly released: number;
  readonly suppressed: number;
  readonly failed: number;
}

@Injectable()
export class BadgeCooldownProcessor {
  private readonly logger = new Logger(BadgeCooldownProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * One pass over up to `maxUsers` users with a releasable badge.
   *
   * Never throws for one user's sake: a failure rolls back that user's
   * transaction, leaves their row queued for the next tick, and moves on.
   */
  async processDue(maxUsers = 100): Promise<BadgeCooldownSummary> {
    const users = returnedRows<{ userId: string }>(
      await this.dataSource.query(CANDIDATE_USERS_SQL, [maxUsers]),
    );

    let released = 0;
    let suppressed = 0;
    let failed = 0;

    for (const { userId } of users) {
      try {
        const outcome = await this.releaseForUser(userId);

        if (outcome.released) {
          released += 1;
        }
        suppressed += outcome.suppressed;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Badge release failed for one user: ${scrubbedMessage(error)}`,
        );
      }
    }

    return { released, suppressed, failed };
  }

  /**
   * Releases this user's oldest queued badge if their cooldown has elapsed.
   *
   * A badge that has since been retired from the catalogue is suppressed rather
   * than celebrated, and does not spend the user's 24-hour window — the next
   * queued badge is considered in the same pass.
   */
  private async releaseForUser(
    userId: string,
  ): Promise<{ released: boolean; suppressed: number }> {
    return this.dataSource.transaction(async (manager) => {
      const [lock] = returnedRows<{ locked: boolean }>(
        await manager.query(TRY_LOCK_SQL, [LOCK_NAMESPACE, userId]),
      );
      if (!lock?.locked) {
        return { released: false, suppressed: 0 };
      }

      const [cooldown] = returnedRows<{ cooling: boolean }>(
        await manager.query(IN_COOLDOWN_SQL, [userId]),
      );

      if (cooldown?.cooling) {
        return { released: false, suppressed: 0 };
      }

      let suppressed = 0;

      for (;;) {
        const [row] = returnedRows<QueuedRow>(
          await manager.query(NEXT_QUEUED_SQL, [userId]),
        );

        if (!row) {
          return { released: false, suppressed };
        }

        if (!row.active || !row.name) {
          await manager.query(SUPPRESS_SQL, [row.id, userId]);
          suppressed += 1;
          continue;
        }

        await manager.query(RELEASE_SQL, [row.id, userId]);
        await this.handOff(manager, userId, row);
        return { released: true, suppressed };
      }
    });
  }

  /**
   * The in-app notification rides the shared realtime channel, so the
   * celebration reaches an open session without a refresh, and sits in the
   * pending inbox for a user who is not online. Deduped on the queue row so a
   * replayed release cannot produce a second moment.
   */
  private async handOff(
    manager: EntityManager,
    userId: string,
    row: QueuedRow,
  ): Promise<void> {
    await this.notificationsService.createInAppNotification(manager, {
      userId,
      notificationType: "badge_earned",
      title: `Badge unlocked: ${row.name}`,
      message: row.description?.trim() || "You unlocked a new badge.",
      actionUrl: null,
      dedupeKey: `badge-release:${row.id}`,
      sourceRuleId: row.ruleId,
      sourceEventId: row.eventId,
    });
  }
}
