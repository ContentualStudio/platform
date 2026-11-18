import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LessonTaggingVocabulary1785110000000 } from "./migrations/1785110000000-LessonTaggingVocabulary";

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
  const migration = new LessonTaggingVocabulary1785110000000();

  return migration[direction](fixture.runner as never).then(() =>
    fixture.statements.join("\n").replace(/\s+/g, " "),
  );
}

test("up adds the tagging columns and gates the closed vocabularies", async () => {
  const sql = await sqlFor("up");

  for (const fragment of [
    'ADD COLUMN "lessonType" text',
    'ADD COLUMN "skillLevel" text',
    'ADD COLUMN "contentType" text',
    'ADD COLUMN "platforms" text[] NOT NULL DEFAULT',
    'ADD COLUMN "programmeRelevance" text[] NOT NULL DEFAULT',
    'ADD COLUMN "programmeDayStart" integer',
    'ADD COLUMN "programmeDayEnd" integer',
    'ADD COLUMN "vimeoVideoId" text',
    'ADD COLUMN "templateMediaId" text',
    "CHK_studio_lessons_lesson_type",
    "CHK_studio_lessons_skill_level",
    "CHK_studio_lessons_content_type",
    "CHK_studio_lessons_platforms",
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }
});

test("every authored tag value is accepted by the check constraints", async () => {
  const sql = await sqlFor("up");

  for (const value of [
    "article",
    "video",
    "masterclass",
    "template",
    "beginner",
    "intermediate",
    "advanced",
    "photo",
    "caption",
    "story",
    "instagram",
    "youtube",
    "tiktok",
    "linkedin",
  ]) {
    assert.ok(
      sql.includes(`'${value}'`),
      `tag value ${value} is not allowed by the constraints`,
    );
  }
});

test("pre-backfill rows stay readable: tags are nullable", async () => {
  const sql = await sqlFor("up");

  assert.equal(sql.includes('"lessonType" text NOT NULL'), false);
  assert.equal(sql.includes('"skillLevel" text NOT NULL'), false);
  assert.equal(sql.includes('"contentType" text NOT NULL'), false);
  assert.equal(sql.includes('"vimeoVideoId" text NOT NULL'), false);
  assert.equal(sql.includes('"templateMediaId" text NOT NULL'), false);
});

test("down drops the constraints before the columns they reference", async () => {
  const sql = await sqlFor("down");

  assert.ok(
    sql.indexOf("CHK_studio_lessons_lesson_type") <
      sql.indexOf('DROP COLUMN IF EXISTS "lessonType"'),
    "the lesson type check must be dropped before its column",
  );

  for (const column of [
    "lessonType",
    "skillLevel",
    "contentType",
    "platforms",
    "programmeRelevance",
    "programmeDayStart",
    "programmeDayEnd",
    "vimeoVideoId",
    "templateMediaId",
  ]) {
    assert.ok(
      sql.includes(`DROP COLUMN IF EXISTS "${column}"`),
      `down does not drop ${column}`,
    );
  }
});
