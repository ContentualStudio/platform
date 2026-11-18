import * as assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeScopeTokens } from "@contentual/content-engine-vocabulary";
import type { FiringContext } from "./dedupe-scope-key";
import { FiringLedgerService, LEASE_MS } from "./firing-ledger.service";

// Only the fields the simulated statements actually read. Rule, user and scope
// live in the map key, which is what the unique index is.
interface LedgerRow {
  id: string;
  userId: string;
  status: "reserved" | "fired";
  leaseToken: string;
  attemptCount: number;
  reservedAt: number;
}

// A stand-in for Postgres that reproduces only what the service depends on: the
// unique index on (ruleId, userId, scopeKey), the conditional lease takeover,
// and the fenced completion update. SQL semantics themselves are proven by
// firing-ledger.integration.test.ts against a real database.
function fakeLedger() {
  const rows = new Map<string, LedgerRow>();
  const statements: { sql: string; params: unknown[] }[] = [];
  let nextId = 1;
  let now = Date.now();

  // TypeORM's postgres driver hands back the raw rows when a RETURNING
  // statement produced some, but a [rows, affectedCount] tuple when it produced
  // none. Reproduced faithfully here: reading `.length` on the empty-result
  // shape sees 2, so a service that trusts it reports a stale token as success.
  const asDriverResult = (rows: unknown[]) => (rows.length > 0 ? rows : [[], 0]);

  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    const text = sql.replace(/\s+/g, " ").trim();

    if (text.startsWith("INSERT INTO")) {
      const [ruleId, userId, scopeKey, , , leaseToken] = params as string[];
      const key = `${ruleId}|${userId}|${scopeKey}`;
      const existing = rows.get(key);

      if (!existing) {
        const row: LedgerRow = {
          id: String(nextId++),
          userId,
          status: "reserved",
          leaseToken,
          attemptCount: 1,
          reservedAt: now,
        };
        rows.set(key, row);
        return asDriverResult([
          { id: row.id, leaseToken: row.leaseToken, attemptCount: row.attemptCount },
        ]);
      }

      // ON CONFLICT ... DO UPDATE ... WHERE status = 'reserved' AND lease expired
      const expired = existing.reservedAt < now - LEASE_MS;

      if (existing.status !== "reserved" || !expired) {
        return asDriverResult([]);
      }

      existing.reservedAt = now;
      existing.leaseToken = leaseToken;
      existing.attemptCount += 1;
      return asDriverResult([
        {
          id: existing.id,
          leaseToken: existing.leaseToken,
          attemptCount: existing.attemptCount,
        },
      ]);
    }

    if (text.startsWith("UPDATE")) {
      const [id, userId, leaseToken] = params as string[];
      const row = [...rows.values()].find(
        (candidate) => candidate.id === id && candidate.userId === userId,
      );

      if (!row || row.status !== "reserved" || row.leaseToken !== leaseToken) {
        return asDriverResult([]);
      }

      row.status = "fired";
      return asDriverResult([{ id: row.id }]);
    }

    if (text.includes('WHERE "id" = $1')) {
      const [id, userId] = params as string[];
      const row = [...rows.values()].find(
        (candidate) => candidate.id === id && candidate.userId === userId,
      );
      return asDriverResult(row ? [{ status: row.status }] : []);
    }

    const [ruleId, userId, scopeKey] = params as string[];
    const row = rows.get(`${ruleId}|${userId}|${scopeKey}`);
    return asDriverResult(row ? [{ status: row.status }] : []);
  };

  const manager = { query };

  return {
    service: new FiringLedgerService(manager as never),
    // Stands in for a transaction's EntityManager handed to markFiredOrThrow.
    manager: manager as never,
    statements,
    advance(ms: number) {
      now += ms;
    },
  };
}

function context(overrides: Partial<FiringContext> = {}): FiringContext {
  return {
    ruleId: "rule-1",
    userId: "user-1",
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "event-1",
    ...overrides,
  };
}

test("a replayed event reserves the same key and the effect runs once", async () => {
  const { service } = fakeLedger();
  let effects = 0;

  for (const eventId of ["event-1", "event-1"]) {
    const reservation = await service.reserve(context({ eventId }));

    if (reservation.fresh) {
      effects += 1;
      await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);
    }
  }

  assert.equal(effects, 1);
});

test("a double cron run for the same scope key fires once", async () => {
  const { service } = fakeLedger();

  const [first, second] = await Promise.all([
    service.reserve(context()),
    service.reserve(context()),
  ]);

  assert.equal([first, second].filter((result) => result.fresh).length, 1);
});

test("every_time reserves a distinct row per event and fires each time", async () => {
  const { service } = fakeLedger();
  let effects = 0;

  for (const eventId of ["event-1", "event-2", "event-3"]) {
    const reservation = await service.reserve(
      context({ dedupeScope: dedupeScopeTokens.everyTime, eventId }),
    );

    if (reservation.fresh) {
      effects += 1;
      await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);
    }
  }

  assert.equal(effects, 3);
});

test("a failed effect blocks retries until its lease expires, then retries", async () => {
  const ledger = fakeLedger();
  const { service } = ledger;

  const first = await service.reserve(context());
  assert.ok(first.fresh);
  // Effect throws here — nothing marks the row fired.

  const insideLease = await service.reserve(context());
  assert.deepEqual(insideLease, { fresh: false, reason: "reservation_held" });

  ledger.advance(LEASE_MS + 1);

  const retry = await service.reserve(context());
  assert.ok(retry.fresh);
  assert.equal(retry.attempt, 2);
  assert.notEqual(retry.leaseToken, first.leaseToken);
});

test("a fired row is never re-reservable, however much time passes", async () => {
  const ledger = fakeLedger();
  const { service } = ledger;

  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);
  await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);

  ledger.advance(LEASE_MS * 100);

  assert.deepEqual(await service.reserve(context()), {
    fresh: false,
    reason: "already_fired",
  });
});

test("a stale holder cannot mark the new holder's reservation fired", async () => {
  const ledger = fakeLedger();
  const { service } = ledger;

  const stale = await service.reserve(context());
  assert.ok(stale.fresh);

  ledger.advance(LEASE_MS + 1);
  const current = await service.reserve(context());
  assert.ok(current.fresh);

  assert.deepEqual(
    await service.markFired("user-1", stale.ledgerId, stale.leaseToken),
    { marked: false, reason: "stale_reservation" },
  );
  assert.deepEqual(
    await service.markFired("user-1", current.ledgerId, current.leaseToken),
    { marked: true },
  );
});

test("marking an already fired row reports it rather than firing twice", async () => {
  const { service } = fakeLedger();

  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);
  await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);

  assert.deepEqual(
    await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken),
    { marked: false, reason: "already_fired" },
  );
});

test("marking an unknown row reports not_found", async () => {
  const { service } = fakeLedger();

  assert.deepEqual(
    await service.markFired("user-1", "404", "00000000-0000-0000-0000-000000000000"),
    { marked: false, reason: "not_found" },
  );
});

test("markFiredOrThrow throws on every failure reason and resolves on success", async () => {
  const ledger = fakeLedger();
  const { service, manager } = ledger;

  await assert.rejects(
    () => service.markFiredOrThrow("user-1", "404", "token", manager),
    /not_found/,
  );

  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);

  await assert.rejects(
    () => service.markFiredOrThrow("user-1", reservation.ledgerId, "wrong", manager),
    /stale_reservation/,
  );

  await service.markFiredOrThrow(
    "user-1",
    reservation.ledgerId,
    reservation.leaseToken,
    manager,
  );

  await assert.rejects(
    () =>
      service.markFiredOrThrow(
        "user-1",
        reservation.ledgerId,
        reservation.leaseToken,
        manager,
      ),
    /already_fired/,
  );
});

test("hasFired is scoped to the acting user", async () => {
  const { service } = fakeLedger();

  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);
  await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);

  assert.equal(await service.hasFired("user-1", "rule-1", "user:*"), true);
  assert.equal(await service.hasFired("user-2", "rule-1", "user:*"), false);
});

test("another user's reservation never blocks this user's firing", async () => {
  const { service } = fakeLedger();

  const first = await service.reserve(context({ userId: "user-1" }));
  const second = await service.reserve(context({ userId: "user-2" }));

  assert.equal(first.fresh, true);
  assert.equal(second.fresh, true);
});

test("every statement the ledger emits carries the acting user id", async () => {
  const ledger = fakeLedger();
  const { service } = ledger;

  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);
  await service.markFired("user-1", reservation.ledgerId, reservation.leaseToken);
  await service.hasFired("user-1", "rule-1", "user:*");

  assert.ok(ledger.statements.length >= 3);
  for (const { sql, params } of ledger.statements) {
    assert.ok(
      params.includes("user-1"),
      `statement is not user-scoped: ${sql.replace(/\s+/g, " ").trim()}`,
    );
    assert.match(sql, /"userId"/);
  }
});

test("an underivable scope key short-circuits before any SQL is emitted", async () => {
  const ledger = fakeLedger();

  const result = await ledger.service.reserve(
    context({ dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme, programmeId: null }),
  );

  assert.deepEqual(result, { fresh: false, reason: "invalid_scope" });
  assert.equal(ledger.statements.length, 0);
});
