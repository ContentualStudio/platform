import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import { DailyLocalSweepService } from "./daily-local-sweep.service";
import type { SweepJob } from "./sweep-job.port";

interface Statement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function build(options: {
  readonly runs?: { id: string; userId: string; localDate: string }[];
  readonly job?: Partial<SweepJob>;
}) {
  const statements: Statement[] = [];
  const queue = [...(options.runs ?? [])];
  const served: string[] = [];

  const job: SweepJob = {
    name: "test.job",
    scopeSql: "true",
    run: async (userId) => {
      served.push(userId);
      return "succeeded";
    },
    ...options.job,
  };

  const dataSource = {
    query: async (sql: string, params?: readonly unknown[]) => {
      statements.push({ sql, params: params ?? [] });

      if (sql.includes(`SET "status" = 'running'`)) {
        const next = queue.shift();
        return next ? [next] : [];
      }

      return [[], 0];
    },
  } as unknown as DataSource;

  return {
    sweep: new DailyLocalSweepService(dataSource, [job]),
    statements,
    served,
  };
}

test("a tick enqueues due work then drains it", async () => {
  const { sweep, statements, served } = build({
    runs: [
      { id: "1", userId: "user-1", localDate: "2026-08-25" },
      { id: "2", userId: "user-2", localDate: "2026-08-25" },
    ],
  });

  const [summary] = await sweep.tick(7);

  assert.ok(statements[0].sql.includes(`INSERT INTO "daily_local_sweep_run"`));
  assert.deepEqual(served, ["user-1", "user-2"]);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 0);
});

// user_profile.timezone is free text, and an unrecognised name makes
// AT TIME ZONE raise — which would stop the sweep for everybody over one row.
test("an unrecognised timezone degrades that user to UTC", async () => {
  const { sweep, statements } = build({});

  await sweep.tick(7);

  const enqueue = statements[0].sql;

  assert.ok(enqueue.includes("pg_timezone_names"));
  assert.ok(enqueue.includes(`COALESCE(tz."name", 'UTC')`));
});

test("the configured hour is what the enqueue compares against", async () => {
  const { sweep, statements } = build({});

  await sweep.tick(9);

  assert.equal(statements[0].params[1], 9);
});

// One user's dead token must not cost everyone else their morning.
test("one user's failure is isolated and the sweep carries on", async () => {
  const { sweep, served } = build({
    runs: [
      { id: "1", userId: "bad", localDate: "2026-08-25" },
      { id: "2", userId: "good", localDate: "2026-08-25" },
    ],
    job: {
      run: async (userId) => {
        served.push?.(userId);
        if (userId === "bad") {
          throw new Error("token exploded");
        }
        return "succeeded";
      },
    },
  });

  const [summary] = await sweep.tick(7);

  assert.equal(summary.failed, 1);
  assert.equal(summary.succeeded, 1);
});

test("a failure records a backoff rather than retrying immediately", async () => {
  const { sweep, statements } = build({
    runs: [{ id: "1", userId: "bad", localDate: "2026-08-25" }],
    job: {
      run: async () => {
        throw new Error("boom");
      },
    },
  });

  await sweep.tick(7);

  const failure = statements.find((entry) =>
    entry.sql.includes(`SET "status" = 'failed'`),
  );

  assert.ok(failure);
  assert.ok(failure.sql.includes(`"availableAt" = now() +`));
});

// A token in an error message would otherwise be written straight into a column
// and read back by whoever debugs the failure.
test("a failed run is offered again once its backoff passes", async () => {
  const { sweep, statements } = build({
    runs: [{ id: "1", userId: "bad", localDate: "2026-08-25" }],
    job: {
      run: async () => {
        throw new Error("boom");
      },
    },
  });

  await sweep.tick(7);

  // The failure path parks the row at availableAt = now() + backoff; the
  // claim must re-offer it after that gate passes, or the user-day strands.
  const claim = statements.find((entry) =>
    entry.sql.includes(`SET "status" = 'running'`),
  );

  assert.ok(
    claim?.sql.includes(`("status" = 'failed')`),
    "failed runs are claimable after backoff",
  );
});

test("a failure message is scrubbed before it is stored", async () => {
  const token = "IGQVJleakedintotheerrormessagevalue";
  const { sweep, statements } = build({
    runs: [{ id: "1", userId: "bad", localDate: "2026-08-25" }],
    job: {
      run: async () => {
        throw new Error(`refresh failed access_token=${token}`);
      },
    },
  });

  await sweep.tick(7);

  const failure = statements.find((entry) =>
    entry.sql.includes(`SET "status" = 'failed'`),
  );

  assert.ok(!String(failure?.params[2]).includes(token));
});

// A skip is a legitimate outcome — consent withdrawn, connection gone — and
// must not be retried as though it were a failure.
test("a skipped run is recorded as skipped, not failed", async () => {
  const { sweep, statements } = build({
    runs: [{ id: "1", userId: "user-1", localDate: "2026-08-25" }],
    job: { run: async () => "skipped" },
  });

  const [summary] = await sweep.tick(7);

  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 0);

  const finish = statements.find((entry) =>
    entry.sql.includes(`SET "status" = $3`),
  );

  assert.equal(finish?.params[2], "skipped");
});

// Fencing: a worker whose claim was taken over must not report on the new
// holder's run.
test("every completion write is fenced on the lease token", async () => {
  const { sweep, statements } = build({
    runs: [{ id: "1", userId: "user-1", localDate: "2026-08-25" }],
  });

  await sweep.tick(7);

  const finish = statements.find((entry) =>
    entry.sql.includes(`SET "status" = $3`),
  );

  assert.ok(finish?.sql.includes(`"leaseToken" = $2`));
});

test("draining stops at the configured ceiling", async () => {
  const runs = Array.from({ length: 10 }, (_unused, index) => ({
    id: String(index),
    userId: `user-${index}`,
    localDate: "2026-08-25",
  }));

  const { sweep, served } = build({ runs });

  const [summary] = await sweep.tick(7, 3);

  assert.equal(summary.claimed, 3);
  assert.equal(served.length, 3);
});

// A sweep that took the process down over one job's bad SQL would deny everyone
// their morning.
test("an enqueue failure never throws out of the tick", async () => {
  const dataSource = {
    query: async () => {
      throw new Error("relation does not exist");
    },
  } as unknown as DataSource;

  const sweep = new DailyLocalSweepService(dataSource, [
    { name: "broken", scopeSql: "true", run: async () => "succeeded" },
  ]);

  assert.deepEqual(await sweep.tick(7), []);
});
