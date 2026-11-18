import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import { dedupeScopeTokens } from "@contentual/content-engine-vocabulary";
import databaseConfig from "../config/database.config";
// Imported for its module side effect: it populates process.env from .env.local
// / .env, so databaseConfig() below reports the developer's real DATABASE_URL
// rather than the built-in fallback. Same idiom as scripts/reset-test-user.ts —
// without it the guard would compare TEST_DATABASE_URL against a URL nobody
// uses, and its "same database" arm would never fire.
import appDataSource from "../database/data-source";
import { EngineFiringLedger1784600000000 } from "../database/migrations/1784600000000-EngineFiringLedger";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import type { FiringContext } from "./dedupe-scope-key";
import { FiringLedgerService, LEASE_MS } from "./firing-ledger.service";

// These prove the SQL itself — the conditional ON CONFLICT ... DO UPDATE, the
// unique index, and real concurrent reservations — which a fake repository
// cannot. They need a disposable Postgres database:
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api test:integration
//
// See docs/database.md. Without the variable the whole file skips, so the
// default unit-test run stays green on a machine with no database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "ledger-integration-user";
const OTHER_USER_ID = "ledger-integration-other-user";
const SCRATCH_TABLE = "engine_firing_ledger_scratch_effect";

let dataSource: DataSource;
let service: FiringLedgerService;

function context(overrides: Partial<FiringContext> = {}): FiringContext {
  return {
    ruleId: "rule-1",
    userId: USER_ID,
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "event-1",
    ...overrides,
  };
}

async function seedUser(id: string) {
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [id, id, `${id}@example.test`],
  );
}

before(async () => {
  if (skip) {
    return;
  }

  // Refuses to touch anything that is not a separate, disposable database.
  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  // Reuse the application's entity/migration globs, driver and ssl handling —
  // only the target database differs. Restating them here would mean a second
  // copy of the discovery rules to keep in step.
  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.query(
    `CREATE TABLE IF NOT EXISTS "${SCRATCH_TABLE}" ("id" text PRIMARY KEY)`,
  );
  await seedUser(USER_ID);
  await seedUser(OTHER_USER_ID);

  service = new FiringLedgerService(dataSource.manager);
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  await dataSource.query(`TRUNCATE TABLE "engine_firing_ledger"`);
  await dataSource.query(`TRUNCATE TABLE "${SCRATCH_TABLE}"`);
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DROP TABLE IF EXISTS "${SCRATCH_TABLE}"`);
  await dataSource.query(`TRUNCATE TABLE "engine_firing_ledger"`);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [
    [USER_ID, OTHER_USER_ID],
  ]);
  await dataSource.destroy();
});

// Runs `work` in a transaction that is *always* rolled back, and always
// releases its connection — including when `work` throws, which is the case
// these tests exist to exercise. A leaked open transaction would hold locks and
// deadlock the teardown.
async function inTransaction(
  work: (manager: EntityManager) => Promise<void>,
): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    await work(runner.manager);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

// Backdates a reservation so its lease reads as expired, without waiting.
async function expireLease(ruleId = "rule-1", scopeKey = "user:*") {
  await dataSource.query(
    `UPDATE "engine_firing_ledger"
        SET "reservedAt" = now() - ($1 || ' milliseconds')::interval
      WHERE "ruleId" = $2 AND "scopeKey" = $3`,
    [String(LEASE_MS * 2), ruleId, scopeKey],
  );
}

test("concurrent reservations for one key: exactly one wins", { skip }, async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => service.reserve(context())),
  );

  assert.equal(results.filter((result) => result.fresh).length, 1);
  const rows = await dataSource.query(
    `SELECT count(*)::int AS count FROM "engine_firing_ledger"`,
  );
  assert.equal(rows[0].count, 1);
});

test("a second reservation inside the lease is blocked", { skip }, async () => {
  assert.equal((await service.reserve(context())).fresh, true);

  assert.deepEqual(await service.reserve(context()), {
    fresh: false,
    reason: "reservation_held",
  });
});

test("an expired reservation is reclaimed with a new token", { skip }, async () => {
  const first = await service.reserve(context());
  assert.ok(first.fresh);

  await expireLease();

  const retry = await service.reserve(context());
  assert.ok(retry.fresh);
  assert.equal(retry.ledgerId, first.ledgerId);
  assert.equal(retry.attempt, 2);
  assert.notEqual(retry.leaseToken, first.leaseToken);
});

test("a fired reservation is never reclaimed", { skip }, async () => {
  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);
  assert.deepEqual(
    await service.markFired(USER_ID, reservation.ledgerId, reservation.leaseToken),
    { marked: true },
  );

  await expireLease();

  assert.deepEqual(await service.reserve(context()), {
    fresh: false,
    reason: "already_fired",
  });
});

test("a superseded lease token cannot mark the row fired", { skip }, async () => {
  const stale = await service.reserve(context());
  assert.ok(stale.fresh);

  await expireLease();
  const current = await service.reserve(context());
  assert.ok(current.fresh);

  assert.deepEqual(
    await service.markFired(USER_ID, stale.ledgerId, stale.leaseToken),
    { marked: false, reason: "stale_reservation" },
  );

  const rows = await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "id" = $1`,
    [current.ledgerId],
  );
  assert.equal(rows[0].status, "reserved");

  assert.deepEqual(
    await service.markFired(USER_ID, current.ledgerId, current.leaseToken),
    { marked: true },
  );
});

test("reads and writes never cross user boundaries", { skip }, async () => {
  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);

  assert.deepEqual(
    await service.markFired(
      OTHER_USER_ID,
      reservation.ledgerId,
      reservation.leaseToken,
    ),
    { marked: false, reason: "not_found" },
  );
  assert.equal(await service.hasFired(OTHER_USER_ID, "rule-1", "user:*"), false);

  // The row is untouched, so its rightful owner can still complete it.
  assert.deepEqual(
    await service.markFired(USER_ID, reservation.ledgerId, reservation.leaseToken),
    { marked: true },
  );
  assert.equal(await service.hasFired(USER_ID, "rule-1", "user:*"), true);

  // A different user reserving the same rule and scope key is not blocked.
  const other = await service.reserve(context({ userId: OTHER_USER_ID }));
  assert.equal(other.fresh, true);
});

test("the unique index rejects a duplicate written outside the service", { skip }, async () => {
  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);

  await assert.rejects(
    () =>
      dataSource.query(
        `INSERT INTO "engine_firing_ledger"
           ("ruleId", "userId", "scopeKey", "dedupeScope", "eventRef", "leaseToken")
         VALUES ($1, $2, $3, $4, $5, gen_random_uuid())`,
        ["rule-1", USER_ID, "user:*", dedupeScopeTokens.oncePerUser, "event-1"],
      ),
    /UQ_engine_firing_ledger_rule_user_scope/,
  );
});

test("a rolled back transaction leaves the reservation unfired", { skip }, async () => {
  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);

  await inTransaction(async (manager) => {
    await manager.query(`INSERT INTO "${SCRATCH_TABLE}" ("id") VALUES ($1)`, [
      "effect-1",
    ]);
    await service.markFiredOrThrow(
      USER_ID,
      reservation.ledgerId,
      reservation.leaseToken,
      manager,
    );
  });

  const ledgerRows = await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "id" = $1`,
    [reservation.ledgerId],
  );
  const effectRows = await dataSource.query(
    `SELECT count(*)::int AS count FROM "${SCRATCH_TABLE}"`,
  );

  assert.equal(ledgerRows[0].status, "reserved");
  assert.equal(effectRows[0].count, 0);
});

// The atomicity that closes the at-most-once gap: a failed completion aborts
// the effect write too, so neither commits on its own.
test("a failed completion rolls the effect write back with it", { skip }, async () => {
  const reservation = await service.reserve(context());
  assert.ok(reservation.fresh);

  await assert.rejects(
    () =>
      inTransaction(async (manager) => {
        await manager.query(
          `INSERT INTO "${SCRATCH_TABLE}" ("id") VALUES ($1)`,
          ["effect-2"],
        );
        await service.markFiredOrThrow(
          USER_ID,
          reservation.ledgerId,
          "00000000-0000-0000-0000-000000000000",
          manager,
        );
      }),
    /stale_reservation/,
  );

  const ledgerRows = await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "id" = $1`,
    [reservation.ledgerId],
  );
  const effectRows = await dataSource.query(
    `SELECT count(*)::int AS count FROM "${SCRATCH_TABLE}"`,
  );

  assert.equal(ledgerRows[0].status, "reserved");
  assert.equal(effectRows[0].count, 0);
});

// Runs last: it drops and recreates the ledger table, so it must not run before
// the tests that depend on it.
//
// `runMigrations()` in the before hook is a no-op on a reused database where
// this migration is already recorded, so it proves nothing about the migration
// itself. This drives up() and down() directly instead, which exercises them on
// every run regardless of what the migrations table already says.
test("the migration creates and removes the whole schema", { skip }, async () => {
  const migration = new EngineFiringLedger1784600000000();
  const runner = dataSource.createQueryRunner();
  await runner.connect();

  const tableExists = async () => {
    const rows = await runner.query(
      `SELECT to_regclass('engine_firing_ledger') IS NOT NULL AS present`,
    );
    return rows[0].present === true;
  };
  const namesOf = async (sql: string) => {
    const rows: { name: string }[] = await runner.query(sql);
    return rows.map((row) => row.name).sort();
  };

  try {
    await migration.down(runner);
    assert.equal(await tableExists(), false, "down() left the table behind");

    await migration.up(runner);
    assert.equal(await tableExists(), true, "up() did not create the table");

    assert.deepEqual(
      await namesOf(
        `SELECT indexname AS name FROM pg_indexes
          WHERE tablename = 'engine_firing_ledger'`,
      ),
      [
        "IDX_engine_firing_ledger_user",
        "UQ_engine_firing_ledger_rule_user_scope",
        "engine_firing_ledger_pkey",
      ],
    );

    assert.deepEqual(
      await namesOf(
        `SELECT conname AS name FROM pg_constraint
          WHERE conrelid = 'engine_firing_ledger'::regclass
            AND contype IN ('c', 'f')`,
      ),
      [
        "CHK_engine_firing_ledger_fired",
        "CHK_engine_firing_ledger_status",
        "FK_engine_firing_ledger_user",
      ],
    );

    // The recreated table must still enforce the guarantees, not merely exist.
    await seedUser(USER_ID);
    const reservation = await service.reserve(context());
    assert.ok(reservation.fresh);
    assert.deepEqual(await service.reserve(context()), {
      fresh: false,
      reason: "reservation_held",
    });
  } finally {
    await runner.release();
  }
});
