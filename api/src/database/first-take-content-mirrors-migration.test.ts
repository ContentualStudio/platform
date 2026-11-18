import * as assert from "node:assert/strict";
import { test } from "node:test";
import { FirstTakeContentMirrors1784800000000 } from "./migrations/1784800000000-FirstTakeContentMirrors";

function queryRunner() {
  const statements: string[] = [];

  return {
    runner: {
      query: async (statement: string) => {
        statements.push(statement);
      },
    },
    statements,
  };
}

test("up adds typed First Take fields, modules, and schedule constraints", async () => {
  const fixture = queryRunner();

  await new FirstTakeContentMirrors1784800000000().up(fixture.runner as never);

  const sql = fixture.statements.join("\n").replace(/\s+/g, " ");
  for (const fragment of [
    'ADD COLUMN "durationDays" integer',
    'CREATE TABLE "programme_modules"',
    'CHK_programme_modules_order_positive',
    'ADD COLUMN "dayNumber" integer',
    'ADD COLUMN "orderWithinDay" integer',
    'ADD COLUMN "publishSlot" boolean',
    'ADD COLUMN "contentType" text',
    'CHK_programme_tasks_content_type',
    'UQ_programme_tasks_programme_day_order',
    'CHK_programme_tasks_publish_post',
    'attachmentsIds',
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }
});

test("down removes only the mirror additions and restores their grants", async () => {
  const fixture = queryRunner();

  await new FirstTakeContentMirrors1784800000000().down(fixture.runner as never);

  const sql = fixture.statements.join("\n");
  assert.match(sql, /DROP TABLE IF EXISTS "programme_modules"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "durationDays"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "dayNumber"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "contentType"/);
  assert.match(sql, /DROP INDEX IF EXISTS "UQ_programme_tasks_programme_day_order"/);
});
