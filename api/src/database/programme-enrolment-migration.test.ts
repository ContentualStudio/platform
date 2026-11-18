import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeEnrolment1785020000000 } from "./migrations/1785020000000-ProgrammeEnrolment";
import { recordingQueryRunner } from "./testing/recording-query-runner";

async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();
  await new ProgrammeEnrolment1785020000000().up(runner);
  return sql.join("\n");
}

test("up creates enrolment, serve ledger, and mirror-gap tables", async () => {
  const combined = await migrationSql();

  for (const fragment of [
    `"programme_enrolment"`,
    `"programme_day_serve"`,
    `"programme_task_mirror_gap"`,
    `CHK_programme_enrolment_status`,
    `'active', 'completed', 'abandoned'`,
    `"currentDay" integer NOT NULL`,
    `"day1ScheduledFor" date NOT NULL`,
    `UQ_programme_enrolment_one_active_per_user`,
    `UQ_programme_day_serve_enrolment_day`,
    `UQ_programme_task_mirror_gap_day`,
    `'served', 'gap_skipped'`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

test("one active enrolment per user is enforced by a partial unique index", async () => {
  const combined = await migrationSql();

  assert.ok(
    combined.includes(`ON "programme_enrolment" ("userId")`),
  );
  assert.ok(combined.includes(`WHERE "status" = 'active'`));
});

test("re-serving the same enrolment day is blocked by the schema", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "programme_day_serve" ("enrolmentId", "programmeDay")`,
    ),
  );
});

test("down drops the three tables", async () => {
  const { runner, sql } = recordingQueryRunner();
  await new ProgrammeEnrolment1785020000000().down(runner);
  const combined = sql.join("\n");

  assert.ok(combined.includes(`DROP TABLE IF EXISTS "programme_task_mirror_gap"`));
  assert.ok(combined.includes(`DROP TABLE IF EXISTS "programme_day_serve"`));
  assert.ok(combined.includes(`DROP TABLE IF EXISTS "programme_enrolment"`));
});
