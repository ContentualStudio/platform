import * as assert from "node:assert/strict";
import { test } from "node:test";
import { DailyLocalSweep1784920000000 } from "./migrations/1784920000000-DailyLocalSweep";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// The unique index below is the reason this table can be swept every minute by
// any number of replicas and still serve each user once a day, so it is pinned
// here rather than left to be rediscovered.
async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();

  await new DailyLocalSweep1784920000000().up(runner);

  return sql.join("\n");
}

test("up creates the sweep queue with its claim fields", async () => {
  const combined = await migrationSql();

  for (const fragment of [
    `"daily_local_sweep_run"`,
    `"jobName" text NOT NULL`,
    `"localDate" date NOT NULL`,
    `"leaseToken" uuid`,
    `"claimedAt" TIMESTAMP WITH TIME ZONE`,
    `"availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    `"attemptCount" integer NOT NULL DEFAULT 0`,
    `CHK_daily_local_sweep_run_status`,
    `'due', 'running', 'succeeded', 'failed', 'skipped'`,
    `FK_daily_local_sweep_run_user`,
    `IDX_daily_local_sweep_run_claimable`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

test("one run per user, job and local day is enforced by the schema", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "daily_local_sweep_run" ("jobName", "userId", "localDate")`,
    ),
  );
});

test("down drops the queue", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new DailyLocalSweep1784920000000().down(runner);

  assert.ok(sql.join("\n").includes(`DROP TABLE IF EXISTS "daily_local_sweep_run"`));
});
