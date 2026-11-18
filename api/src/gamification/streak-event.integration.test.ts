import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import databaseConfig from "../config/database.config";
import appDataSource from "../database/data-source";
import { GamificationState1784710000000 } from "../database/migrations/1784710000000-GamificationState";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { ContentEventBatch } from "../content-engine/event-batch";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { GamificationService } from "./gamification.service";

// Real date arithmetic (day-1 gaps, roll-overs) is exactly what a fake
// manager cannot prove — these run the actual UPDATE ... WHERE
// "lastActiveDate" = $2::date - 1 predicates against Postgres.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "streak-event-user";

let dataSource: DataSource;
let emitter: ContentEventEmitter;
let service: GamificationService;

async function recordCompletion(localDate: string, lifetimeTaskCompletions: number) {
  const batch = new ContentEventBatch();
  await dataSource.transaction((manager) =>
    service.recordTaskCompletion(manager, batch, {
      userId: USER_ID,
      localDate,
      lifetimeTaskCompletions,
    }),
  );
  return batch.eventIds;
}

async function sweepBreaks(asOfLocalDate: string) {
  const batch = new ContentEventBatch();
  await dataSource.transaction((manager) =>
    service.recordStreakBreaks(manager, batch, { userId: USER_ID, asOfLocalDate }),
  );
  return batch.eventIds;
}

async function outboxRows(eventNamePrefix: string) {
  return (await dataSource.query(
    `SELECT "id", "eventName", "payload" FROM "content_engine_events"
     WHERE "userId" = $1 AND "eventName" = $2 ORDER BY "createdAt"`,
    [USER_ID, eventNamePrefix],
  )) as { id: string; eventName: string; payload: Record<string, unknown> }[];
}

before(async () => {
  if (skip) {
    return;
  }

  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();

  emitter = new ContentEventEmitter();
  service = new GamificationService(emitter);
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  for (const table of ["content_engine_events", "user_streak", "user_level"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER_ID, "Streak Event", `${USER_ID}@example.test`],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  for (const table of ["content_engine_events", "user_streak", "user_level"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("three consecutive local days produce three streak.reached events", { skip }, async () => {
  await recordCompletion("2026-07-01", 1);
  await recordCompletion("2026-07-02", 2);
  await recordCompletion("2026-07-03", 3);

  const reached = await outboxRows(eventNameTokens.streakReached);
  assert.deepEqual(
    reached.map((row) => row.payload.streakLength),
    [1, 2, 3],
  );
  assert.deepEqual(
    reached.map((row) => row.id),
    ["streak.reached:streak-event-user:1:1", "streak.reached:streak-event-user:1:2", "streak.reached:streak-event-user:1:3"],
  );
});

test(
  "a gap then a return emits broken, resumed and reached (length 1, run 2) in one call",
  { skip },
  async () => {
    await recordCompletion("2026-07-01", 1);
    await recordCompletion("2026-07-02", 2);

    // 2026-07-05 is a two-day gap after 2026-07-02.
    const ids = await recordCompletion("2026-07-05", 3);

    assert.deepEqual(ids, [
      "streak.broken:streak-event-user:1",
      "streak.resumed:streak-event-user:2",
      "streak.reached:streak-event-user:2:1",
    ]);

    const broken = await outboxRows(eventNameTokens.streakBroken);
    assert.equal(broken.length, 1);
    assert.equal(broken[0]?.payload.priorLength, 2);
  },
);

test(
  "an eager sweep break is not duplicated by the lazy roll-over on return",
  { skip },
  async () => {
    await recordCompletion("2026-07-01", 1);

    // Sweep three days later — a two-day gap.
    const sweepIds = await sweepBreaks("2026-07-04");
    assert.deepEqual(sweepIds, ["streak.broken:streak-event-user:1"]);

    // The user returns two days after that.
    const returnIds = await recordCompletion("2026-07-06", 2);
    assert.deepEqual(returnIds, [
      "streak.resumed:streak-event-user:2",
      "streak.reached:streak-event-user:2:1",
    ]);

    const broken = await outboxRows(eventNameTokens.streakBroken);
    assert.equal(broken.length, 1, "exactly one streak.broken row must exist for run 1");
  },
);

test(
  "the migration is reversible and round-trips both tables",
  { skip },
  async () => {
    const migration = new GamificationState1784710000000();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    // Always rolled back: replaying an old migration on the shared test
    // database would otherwise drop every column later migrations added.
    await runner.startTransaction();

    try {
      await migration.down(runner);
      assert.equal(await runner.hasTable("user_level"), false);
      assert.equal(await runner.hasTable("user_streak"), false);

      await migration.up(runner);
      assert.equal(await runner.hasTable("user_streak"), true);
      assert.equal(await runner.hasTable("user_level"), true);

      await runner.query(
        `INSERT INTO "user_streak"
           ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength")
         VALUES ($1, now()::date, now()::date, 1, 1)`,
        [USER_ID],
      );

      await assert.rejects(
        () =>
          runner.query(
            `UPDATE "user_streak" SET "currentLength" = 0 WHERE "userId" = $1`,
            [USER_ID],
          ),
        /CHK_user_streak_current_length/,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  },
);
