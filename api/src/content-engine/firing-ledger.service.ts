import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import { dedupeScopeKey, type FiringContext } from "./dedupe-scope-key";
import { firingLedgerStatus } from "./entities/engine-firing-ledger.entity";

// How long a reservation may be held before another worker may take it over.
// Long enough that a slow effect is not stolen mid-flight, short enough that a
// crashed worker does not block a legitimate retry for a whole day.
export const LEASE_MS = 15 * 60 * 1000;

export type Reservation =
  | { fresh: true; ledgerId: string; leaseToken: string; attempt: number }
  | {
      fresh: false;
      reason: "already_fired" | "reservation_held" | "invalid_scope";
    };

export type MarkResult =
  | { marked: true }
  | {
      marked: false;
      reason: "stale_reservation" | "already_fired" | "not_found";
    };

// Insert-or-ignore against the unique index, with a fenced lease takeover. The
// conflict target is exactly the unique index, so a replayed event or a double
// cron run collides here and returns no rows. The DO UPDATE branch fires only
// for a row that is still `reserved` and whose lease has expired, and it mints a
// new leaseToken so the previous holder is fenced out.
//
// The lease is a build-time constant, so it is inlined rather than bound: as a
// parameter it cost a string concat and an interval parse on every execution.
// Interpolation is safe here — LEASE_MS is a number literal, never user input.
const RESERVE_SQL = `
  INSERT INTO "engine_firing_ledger"
    ("ruleId", "userId", "scopeKey", "dedupeScope", "eventRef", "leaseToken", "reservedAt")
  VALUES ($1, $2, $3, $4, $5, $6, now())
  ON CONFLICT ("ruleId", "userId", "scopeKey") DO UPDATE
    SET "reservedAt"   = now(),
        "eventRef"     = EXCLUDED."eventRef",
        "leaseToken"   = EXCLUDED."leaseToken",
        "attemptCount" = "engine_firing_ledger"."attemptCount" + 1
    WHERE "engine_firing_ledger"."status" = 'reserved'
      AND "engine_firing_ledger"."reservedAt"
          < now() - interval '${LEASE_MS} milliseconds'
  RETURNING "id", "leaseToken", "attemptCount"
`;

const STATUS_BY_KEY_SQL = `
  SELECT "status" FROM "engine_firing_ledger"
  WHERE "ruleId" = $1 AND "userId" = $2 AND "scopeKey" = $3
`;

const STATUS_BY_ID_SQL = `
  SELECT "status" FROM "engine_firing_ledger"
  WHERE "id" = $1 AND "userId" = $2
`;

const MARK_FIRED_SQL = `
  UPDATE "engine_firing_ledger"
     SET "status" = 'fired', "firedAt" = now()
   WHERE "id" = $1 AND "userId" = $2
     AND "leaseToken" = $3 AND "status" = 'reserved'
  RETURNING "id"
`;

// TypeORM's postgres driver returns the raw rows of a RETURNING statement when
// there are any, but falls back to a [rows, affectedCount] tuple when there are
// none. Reading `.length` on the raw result would therefore see 2 for "nothing
// matched" — which, on the completion update, would mean a stale token reported
// success. Normalise both shapes to a row array.
function returnedRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }

  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * The Content Engine's firing ledger — the gate between the rule evaluator and
 * the effect handlers. Nothing else writes this table: effect handlers never
 * touch it, they only receive the reservation this service hands them.
 *
 * Guarantee: at most one active reservation holder per (ruleId, userId,
 * scopeKey), and a firing already marked `fired` is never re-reservable.
 *
 * NOT guaranteed on its own: at-most-once *effects*. A crash between a
 * successful effect and the fired-mark, or an effect outliving its lease, would
 * let a later holder re-run it. The unique index serialises reservations; it
 * cannot make an external side effect atomic with a row update. Each effect
 * handler must therefore do one of:
 *
 *  1. Use `ledgerId` as an idempotency key, enforced in its own store or at the
 *     provider; or
 *  2. Write its effect and complete the ledger in one transaction, via
 *     `markFiredOrThrow(userId, ledgerId, leaseToken, manager)` — which throws
 *     on anything but success so the transaction rolls back. A transactional
 *     handler must never call `markFired` and commit regardless of the result;
 *     or
 *  3. Record the effect in a transactional outbox alongside the fired-mark, and
 *     deliver it idempotently.
 *
 * Every read and write is scoped to the acting user.
 */
@Injectable()
export class FiringLedgerService {
  // Every statement here is raw SQL, so the entity manager is injected directly
  // rather than a repository that would never be used as one.
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  // Reserves the right to run this rule's effect for this user. Only a
  // `fresh: true` result permits the effect to run.
  async reserve(context: FiringContext): Promise<Reservation> {
    const key = dedupeScopeKey(context);

    if (!key.ok) {
      return { fresh: false, reason: "invalid_scope" };
    }

    const rows = returnedRows<{
      id: string;
      leaseToken: string;
      attemptCount: number;
    }>(
      await this.manager().query(RESERVE_SQL, [
        context.ruleId,
        context.userId,
        key.scopeKey,
        context.dedupeScope,
        context.eventId,
        randomUUID(),
      ]),
    );

    const [reserved] = rows;

    if (reserved) {
      return {
        fresh: true,
        ledgerId: String(reserved.id),
        leaseToken: reserved.leaseToken,
        attempt: Number(reserved.attemptCount),
      };
    }

    // Something already holds the key. Both outcomes mean "do not run the
    // effect"; they are distinguished only so callers can log the difference.
    const existing = returnedRows<{ status: string }>(
      await this.manager().query(STATUS_BY_KEY_SQL, [
        context.ruleId,
        context.userId,
        key.scopeKey,
      ]),
    );

    return {
      fresh: false,
      reason: existing[0]?.status === firingLedgerStatus.fired ? "already_fired" : "reservation_held",
    };
  }

  // Completes a reservation. The leaseToken fences it: a holder whose lease was
  // taken over presents a superseded token and cannot mark the new holder's
  // reservation fired.
  async markFired(
    userId: string,
    ledgerId: string,
    leaseToken: string,
    manager?: EntityManager,
  ): Promise<MarkResult> {
    const rows = returnedRows<{ id: string }>(
      await this.manager(manager).query(MARK_FIRED_SQL, [
        ledgerId,
        userId,
        leaseToken,
      ]),
    );

    if (rows.length > 0) {
      return { marked: true };
    }

    // Read through the same manager so a caller's open transaction sees its own
    // uncommitted writes.
    const existing = returnedRows<{ status: string }>(
      await this.manager(manager).query(STATUS_BY_ID_SQL, [ledgerId, userId]),
    );

    if (existing.length === 0) {
      return { marked: false, reason: "not_found" };
    }

    return {
      marked: false,
      reason:
        existing[0].status === firingLedgerStatus.fired ? "already_fired" : "stale_reservation",
    };
  }

  // Transactional callers use this: any outcome other than a successful mark
  // throws, so the surrounding transaction rolls back and the effect write
  // cannot commit without its ledger completion.
  async markFiredOrThrow(
    userId: string,
    ledgerId: string,
    leaseToken: string,
    manager: EntityManager,
  ): Promise<void> {
    const result = await this.markFired(userId, ledgerId, leaseToken, manager);

    if (!result.marked) {
      throw new Error(
        `Firing ledger completion failed (${result.reason}) for ledger ${ledgerId}`,
      );
    }
  }

  async hasFired(
    userId: string,
    ruleId: string,
    scopeKey: string,
  ): Promise<boolean> {
    const rows = returnedRows<{ status: string }>(
      await this.manager().query(STATUS_BY_KEY_SQL, [ruleId, userId, scopeKey]),
    );

    return rows[0]?.status === firingLedgerStatus.fired;
  }

  private manager(override?: EntityManager): EntityManager {
    return override ?? this.entityManager;
  }
}
