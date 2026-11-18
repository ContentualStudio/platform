import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { isBigserialId } from "../common/bigserial-id";
import { returnedRows } from "../content-engine/returned-rows";

/**
 * The celebrations a user is owed: badges the cooldown processor has released
 * that the user has not yet been shown.
 *
 * Independent of notification preferences on purpose. Opting out of badge
 * notifications silences the inbox entry the release creates, not the
 * celebration itself.
 */

// A user earns at most one release a day, so this only bites after a long
// absence; the rest are returned on the next read once these are shown.
const MAX_PENDING = 10;

// Oldest release first, so a backlog is celebrated in the order it was earned.
// Inner join: a badge whose catalogue row has since been deleted has nothing
// to show, so it is left out rather than rendered blank.
const LIST_PENDING_SQL = `
  SELECT q."id", b."key", b."name", b."description"
    FROM "badge_cooldown_queue" q
    JOIN "engine_badges" b ON b."sourceDocumentId" = q."badgeId"
   WHERE q."userId" = $1
     AND q."status" = 'released'
     AND q."shownAt" IS NULL
   ORDER BY q."releasedAt", q."id"
   LIMIT ${MAX_PENDING}
`;

// Idempotent: a second call for a row already shown still matches the row and
// keeps its first `shownAt`, so a retried request succeeds rather than 404s.
const MARK_SHOWN_SQL = `
  UPDATE "badge_cooldown_queue"
     SET "shownAt" = COALESCE("shownAt", now())
   WHERE "id" = $1 AND "userId" = $2 AND "status" = 'released'
  RETURNING "id"
`;

export interface PendingBadgeCelebration {
  /** The release's id: what the client marks as shown. */
  readonly id: string;
  /** The catalogue key, which names the badge's artwork. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
}

@Injectable()
export class BadgeCelebrationService {
  constructor(private readonly dataSource: DataSource) {}

  async listPending(userId: string): Promise<PendingBadgeCelebration[]> {
    return returnedRows<PendingBadgeCelebration>(
      await this.dataSource.query(LIST_PENDING_SQL, [userId]),
    );
  }

  /** False when the release does not exist or is not this user's. */
  async markShown(userId: string, celebrationId: string): Promise<boolean> {
    if (!isBigserialId(celebrationId)) {
      return false;
    }

    const updated = returnedRows<{ id: string }>(
      await this.dataSource.query(MARK_SHOWN_SQL, [celebrationId, userId]),
    );

    return updated.length > 0;
  }
}
