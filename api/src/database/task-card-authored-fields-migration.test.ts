import * as assert from "node:assert/strict";
import { test } from "node:test";
import { TaskCardAuthoredFields1785030000000 } from "./migrations/1785030000000-TaskCardAuthoredFields";

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

function sqlFor(direction: "up" | "down") {
  const fixture = queryRunner();
  const migration = new TaskCardAuthoredFields1785030000000();

  return migration[direction](fixture.runner as never).then(() =>
    fixture.statements.join("\n").replace(/\s+/g, " "),
  );
}

test("up adds the five authored task-card columns and gates the platform vocabulary", async () => {
  const sql = await sqlFor("up");

  for (const fragment of [
    'ADD COLUMN "platform" text',
    'ADD COLUMN "cameraRequired" boolean NOT NULL DEFAULT false',
    'ADD COLUMN "objective" text',
    'ADD COLUMN "openingLine" text',
    'ADD COLUMN "whyItMatters" jsonb',
    'CHK_programme_tasks_platform',
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }
});

test("every platform the card can label is accepted by the check constraint", async () => {
  const sql = await sqlFor("up");

  for (const platform of [
    "instagram",
    "tiktok",
    "youtube",
    "linkedin",
    "facebook",
    "x",
    "pinterest",
  ]) {
    assert.ok(
      sql.includes(`'${platform}'`),
      `platform ${platform} is not allowed by the constraint`,
    );
  }
});

test("the columns are added nullable, so already-published tasks need no backfill", async () => {
  const sql = await sqlFor("up");

  // cameraRequired is the deliberate exception: false and "unanswered" read
  // the same on the card, so it carries a default instead of a null.
  assert.equal(sql.includes('"platform" text NOT NULL'), false);
  assert.equal(sql.includes('"objective" text NOT NULL'), false);
  assert.equal(sql.includes('"openingLine" text NOT NULL'), false);
  assert.equal(sql.includes('"whyItMatters" jsonb NOT NULL'), false);
});

test("down drops the constraint before the columns it references", async () => {
  const sql = await sqlFor("down");

  assert.ok(
    sql.indexOf("CHK_programme_tasks_platform") <
      sql.indexOf('DROP COLUMN IF EXISTS "platform"'),
    "the platform check must be dropped before its column",
  );

  for (const column of [
    "platform",
    "cameraRequired",
    "objective",
    "openingLine",
    "whyItMatters",
  ]) {
    assert.ok(
      sql.includes(`DROP COLUMN IF EXISTS "${column}"`),
      `down does not drop ${column}`,
    );
  }
});
