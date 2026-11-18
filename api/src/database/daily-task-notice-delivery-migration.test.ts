import * as assert from "node:assert/strict";
import { test } from "node:test";
import { DailyTaskNoticeDelivery1785120000000 } from "./migrations/1785120000000-DailyTaskNoticeDelivery";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// The unique index below is what keeps a retried morning from resending the
// email when the inbox row already exists (or when in-app is opted out), so
// it is pinned here rather than left to be rediscovered.
async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();

  await new DailyTaskNoticeDelivery1785120000000().up(runner);

  return sql.join("\n");
}

test("up creates the notice delivery ledger with its channel guard", async () => {
  const combined = await migrationSql();

  for (const fragment of [
    `"daily_task_notice_delivery"`,
    `"localDate" date NOT NULL`,
    `"programmeDay" integer NOT NULL`,
    `"channel" text NOT NULL`,
    `"sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    `CHK_daily_task_notice_delivery_day`,
    `CHK_daily_task_notice_delivery_channel`,
    `'in_app', 'email'`,
    `FK_daily_task_notice_delivery_user`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

test("one delivery per user, local day, programme day and channel is enforced by the schema", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "daily_task_notice_delivery" ("userId", "localDate", "programmeDay", "channel")`,
    ),
  );
});

test("down drops the ledger", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new DailyTaskNoticeDelivery1785120000000().down(runner);

  assert.ok(
    sql.join("\n").includes(`DROP TABLE IF EXISTS "daily_task_notice_delivery"`),
  );
});
