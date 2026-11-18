import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { DailyLocalSweepService } from "./daily-local-sweep.service";
import type { SweepJob } from "./sweep-job.port";

// The two claims worth a real database: a user is served once per local day
// however often the sweep ticks, and two workers racing for the same row give
// exactly one winner. Neither can be shown with fakes — both are properties of
// the unique index and of FOR UPDATE SKIP LOCKED.

const USERS = ["sweep-user-a", "sweep-user-b"];
const JOB = "test.sweep-job";

let dataSource: DataSource;

function job(overrides: Partial<SweepJob> = {}): SweepJob {
  return {
    name: JOB,
    scopeSql: `p."userId" LIKE 'sweep-user-%'`,
    run: async () => "succeeded",
    ...overrides,
  };
}

async function seed(timezone: string) {
  for (const userId of USERS) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
      [userId, userId, `${userId}@example.test`],
    );
    await dataSource.query(
      `INSERT INTO "user_profile" ("userId", "timezone") VALUES ($1, $2)`,
      [userId, timezone],
    );
  }
}

async function runRows() {
  return (await dataSource.query(
    `SELECT "userId", "status", "localDate", "attemptCount"
       FROM "daily_local_sweep_run"
      WHERE "jobName" = $1 ORDER BY "userId"`,
    [JOB],
  )) as {
    userId: string;
    status: string;
    localDate: string;
    attemptCount: number;
  }[];
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

async function clean() {
  await dataSource.query(`DELETE FROM "daily_local_sweep_run" WHERE "jobName" = $1`, [
    JOB,
  ]);
  for (const userId of USERS) {
    await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [userId]);
    await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [userId]);
  }
}

beforeEach(async () => {
  if (skip) {
    return;
  }

  await clean();
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await clean();
  await dataSource.destroy();
});

test("each eligible user is enqueued and served once", { skip }, async () => {
  await seed("UTC");
  const served: string[] = [];
  const sweep = new DailyLocalSweepService(dataSource, [
    job({
      run: async (userId) => {
        served.push(userId);
        return "succeeded";
      },
    }),
  ]);

  // Hour 0 so the enqueue fires whatever the wall clock says during the run.
  await sweep.tick(0);

  assert.deepEqual(served.sort(), [...USERS].sort());
  assert.deepEqual(
    (await runRows()).map((row) => row.status),
    ["succeeded", "succeeded"],
  );
});

// The whole reason the table is keyed the way it is: the sweep can tick as
// often as it likes and a user is still served once a day.
test("ticking repeatedly does not serve a user twice", { skip }, async () => {
  await seed("UTC");
  const served: string[] = [];
  const sweep = new DailyLocalSweepService(dataSource, [
    job({
      run: async (userId) => {
        served.push(userId);
        return "succeeded";
      },
    }),
  ]);

  await sweep.tick(0);
  await sweep.tick(0);
  await sweep.tick(0);

  assert.equal(served.length, USERS.length);
  assert.equal((await runRows()).length, USERS.length);
});

test("two sweeps racing for the same work produce one winner each", { skip }, async () => {
  await seed("UTC");
  const served: string[] = [];
  const makeSweep = () =>
    new DailyLocalSweepService(dataSource, [
      job({
        run: async (userId) => {
          served.push(userId);
          return "succeeded";
        },
      }),
    ]);

  await Promise.all([makeSweep().tick(0), makeSweep().tick(0)]);

  assert.equal(served.length, USERS.length, "no user was served twice");
  assert.deepEqual(served.sort(), [...USERS].sort());
});

test("a user whose local hour has not arrived is not enqueued", { skip }, async () => {
  await seed("UTC");
  const sweep = new DailyLocalSweepService(dataSource, [job()]);

  // 24 is past every possible local hour, so nothing is ever due.
  await sweep.tick(24);

  assert.equal((await runRows()).length, 0);
});

// Free text from a profile form. AT TIME ZONE raises on an unknown name, which
// without the guard would fail the enqueue for every user at once.
test("an invalid timezone does not break the sweep for everybody", { skip }, async () => {
  await seed("Not/A_Real_Zone");
  const served: string[] = [];
  const sweep = new DailyLocalSweepService(dataSource, [
    job({
      run: async (userId) => {
        served.push(userId);
        return "succeeded";
      },
    }),
  ]);

  await sweep.tick(0);

  assert.equal(served.length, USERS.length);
});

test("the local date recorded is the user's, not the server's", { skip }, async () => {
  await seed("Pacific/Kiritimati");
  const sweep = new DailyLocalSweepService(dataSource, [job()]);

  await sweep.tick(0);

  const [row] = await runRows();
  const [expected] = (await dataSource.query(
    `SELECT (now() AT TIME ZONE 'Pacific/Kiritimati')::date AS "localDate"`,
  )) as { localDate: Date }[];

  assert.equal(
    String(row.localDate),
    String(expected.localDate),
    "the run is keyed to the user's own day",
  );
});

// A crashed worker leaves its row claimed. Without takeover it would be stuck
// until someone noticed.
test("a run whose worker died is taken over once its lease expires", { skip }, async () => {
  await seed("UTC");
  const sweep = new DailyLocalSweepService(dataSource, [job()]);

  await dataSource.query(
    `INSERT INTO "daily_local_sweep_run"
       ("jobName", "userId", "localDate", "status", "leaseToken", "claimedAt")
     VALUES ($1, $2, (now() AT TIME ZONE 'UTC')::date, 'running',
             gen_random_uuid(), now() - interval '1 hour')`,
    [JOB, USERS[0]],
  );

  await sweep.tick(0);

  const rows = await runRows();
  const takenOver = rows.find((row) => row.userId === USERS[0]);

  assert.equal(takenOver?.status, "succeeded");
  assert.ok(takenOver && takenOver.attemptCount >= 1);
});

test("a failed run is not retried until its backoff has passed", { skip }, async () => {
  await seed("UTC");
  let attempts = 0;
  const sweep = new DailyLocalSweepService(dataSource, [
    job({
      run: async () => {
        attempts += 1;
        throw new Error("nope");
      },
    }),
  ]);

  await sweep.tick(0);
  const afterFirst = attempts;

  await sweep.tick(0);

  assert.equal(attempts, afterFirst, "a failed run waits out its backoff");
  assert.ok((await runRows()).every((row) => row.status === "failed"));
});

test("a failed run is retried after its backoff has passed", { skip }, async () => {
  await seed("UTC");
  // Counted per user: both seeded users are served on every tick, and each
  // one's first attempt fails.
  const attempts = new Map<string, number>();
  const sweep = new DailyLocalSweepService(dataSource, [
    job({
      run: async (userId) => {
        const attempt = (attempts.get(userId) ?? 0) + 1;
        attempts.set(userId, attempt);

        if (attempt === 1) {
          throw new Error("nope");
        }

        return "succeeded";
      },
    }),
  ]);

  await sweep.tick(0);
  assert.deepEqual(
    USERS.map((userId) => attempts.get(userId)),
    [1, 1],
  );

  await dataSource.query(
    `UPDATE "daily_local_sweep_run"
        SET "availableAt" = now() - interval '1 minute'
      WHERE "jobName" = $1`,
    [JOB],
  );
  await sweep.tick(0);

  assert.deepEqual(
    USERS.map((userId) => attempts.get(userId)),
    [2, 2],
    "a failed run is re-offered after backoff",
  );
  assert.ok((await runRows()).every((row) => row.status === "succeeded"));
});
