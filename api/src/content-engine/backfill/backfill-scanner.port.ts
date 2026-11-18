import type { EntityManager } from "typeorm";
import type { EventName } from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "../content-event";

/**
 * One page of backfill candidates, plus where to resume.
 *
 * A `cursor` of null means the scan is exhausted. An empty page with a non-null
 * cursor is legal and does happen — a page of rows can be filtered down to
 * nothing (a follower snapshot below every tier, say) while later rows still
 * qualify — so paging must stop on the cursor, never on emptiness.
 */
export interface BackfillPage {
  readonly candidates: readonly ContentEvent[];
  readonly cursor: string | null;
}

/**
 * Turns the stored state of one event family into the events that state implies.
 *
 * Each candidate is a synthetic envelope, built the way the live emitter would
 * have built it — the same stable event ID, from `contentEventIds`, and a
 * payload the vocabulary schema accepts. The matching ID is what makes a
 * backfill safe next to a live firing under `every_time`: the dedupe key for
 * that scope *is* the event ID, so a rule that already fired live collides on
 * the ledger's unique index rather than firing twice.
 *
 * Nothing here writes to `content_engine_events`. A backfill is not a replay of
 * history — it does not manufacture outbox rows that later look like facts that
 * happened. The envelope exists only for the duration of the firing decision.
 *
 * Scanners read *current* state and nothing else. Where the state carries a
 * liveness flag the scan honours it (`brokenAt IS NULL`, `disconnectedAt IS
 * NULL`), which is what keeps a backfill from firing on a streak that has since
 * broken or a platform since disconnected.
 */
export interface RuleBackfillScanner {
  readonly eventName: EventName;

  /**
   * Payload fields this family's stored state cannot reconstruct.
   *
   * A live `level.changed` carries the level the user came *from*; app Postgres
   * keeps only the level they are on now. The payload still needs a
   * schema-valid value, so one is supplied — and because a condition reading it
   * would then be comparing against a placeholder, the backfill service refuses
   * any rule whose conditions touch these fields rather than answering with a
   * number nobody can defend.
   */
  readonly unreconstructibleFields: readonly string[];

  /**
   * Reads one page, resuming after `cursor` (null starts at the beginning).
   *
   * Paging is keyset, ordered by the same columns the cursor encodes: an OFFSET
   * scan would skip or repeat rows as concurrent writes shift the window, and a
   * backfill runs long enough for that to be certain rather than unlucky.
   */
  scanPage(
    manager: EntityManager,
    cursor: string | null,
    limit: number,
  ): Promise<BackfillPage>;

  /**
   * How many distinct users this family's scan covers.
   *
   * The acceptance criteria ask for users, but a scan is expressed in
   * candidates: a per-record family produces one per stored fact, and
   * `follower.milestone` one per tier cleared, so a user can be scanned several
   * times. Counting them with a `Set` accumulated during the run would hold the
   * user table in memory and — worse — would reset every time a resumed run
   * picked up from its cursor, reporting different numbers for the same
   * rollout depending on how many times it was interrupted.
   *
   * One `COUNT(DISTINCT "userId")` over the same predicate as `scanPage` is
   * exact, bounded, and gives the same answer however the run was split up.
   */
  countUsers(manager: EntityManager): Promise<number>;
}
