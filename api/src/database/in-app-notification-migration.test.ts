import * as assert from "node:assert/strict";
import { test } from "node:test";
import { InAppNotificationInbox1784870000000 } from "./migrations/1784870000000-InAppNotificationInbox";

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

test("up creates the durable inbox with safe routing and dedupe constraints", async () => {
  const fixture = queryRunner();

  await new InAppNotificationInbox1784870000000().up(
    fixture.runner as never,
  );

  const sql = fixture.statements.join("\n").replace(/\s+/g, " ");
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS "in_app_notification"',
    'FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE',
    'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_in_app_notification_user_dedupe" ON "in_app_notification" ("userId", "dedupeKey")',
    '"readAt" TIMESTAMP WITH TIME ZONE',
    '"dismissedAt" TIMESTAMP WITH TIME ZONE',
    '"sourceEngineMessageId" bigint',
    '"notificationType" IS NULL OR "notificationType" IN',
    '"actionUrl" IS NULL OR ( "actionUrl" LIKE',
    '"actionUrl" NOT LIKE \'//%\'',
    "position('%' in \"actionUrl\") = 0",
    "position(chr(92) in \"actionUrl\") = 0",
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }
});

test("up keeps control-character validation parser-safe for PostgreSQL", async () => {
  const fixture = queryRunner();

  await new InAppNotificationInbox1784870000000().up(
    fixture.runner as never,
  );

  const sql = fixture.statements.join("\n").replace(/\s+/g, " ");
  assert.ok(sql.includes(`"actionUrl" !~ '[[:cntrl:]]'`));
  assert.ok(sql.includes('position(chr(8232) in "actionUrl") = 0'));
  assert.ok(sql.includes('position(chr(8233) in "actionUrl") = 0'));
  assert.equal(sql.includes("E'[\\x00"), false);
});

test("down removes only the inbox objects", async () => {
  const fixture = queryRunner();

  await new InAppNotificationInbox1784870000000().down(
    fixture.runner as never,
  );

  const sql = fixture.statements.join("\n");
  assert.match(sql, /DROP INDEX IF EXISTS "IDX_in_app_notification_unread"/);
  assert.match(sql, /DROP INDEX IF EXISTS "IDX_in_app_notification_inbox"/);
  assert.match(sql, /DROP INDEX IF EXISTS "UQ_in_app_notification_user_dedupe"/);
  assert.match(sql, /DROP TABLE IF EXISTS "in_app_notification"/);
  assert.doesNotMatch(sql, /engine_in_app_message.*DROP/i);
});
