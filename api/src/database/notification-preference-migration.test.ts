import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotificationPreferenceStore1784860000000 } from "./migrations/1784860000000-NotificationPreferenceStore";

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

test("up creates the preference store and backfills legacy profile choices", async () => {
  const fixture = queryRunner();

  await new NotificationPreferenceStore1784860000000().up(
    fixture.runner as never,
  );

  const sql = fixture.statements.join("\n").replace(/\s+/g, " ");
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS "notification_preference"',
    'PRIMARY KEY ("userId", "notificationType", "channel")',
    'FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE',
    'CROSS JOIN LATERAL',
    'NOT "preferenceValue"',
    'ON CONFLICT ("userId", "notificationType", "channel") DO NOTHING',
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }
});

test("down removes only the notification preference store", async () => {
  const fixture = queryRunner();

  await new NotificationPreferenceStore1784860000000().down(
    fixture.runner as never,
  );

  const sql = fixture.statements.join("\n");
  assert.match(sql, /DROP INDEX IF EXISTS "IDX_notification_preference_user"/);
  assert.match(sql, /DROP TABLE IF EXISTS "notification_preference"/);
});
