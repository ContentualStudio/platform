import assert from "node:assert/strict";
import test from "node:test";

import { down, up } from "../20260808_084155_first_take_content_model";

function database() {
  const statements: string[] = [];
  return {
    db: {
      execute: async (statement: unknown) => {
        const chunks = (
          statement as { queryChunks?: Array<{ value?: string[] }> }
        ).queryChunks;
        statements.push(
          chunks
            ?.flatMap((chunk) => chunk.value ?? [])
            .join("") ?? String(statement),
        );
        return [];
      },
    },
    statements,
  };
}

test("up creates the module collection and new version/relationship tables", async () => {
  const fixture = database();

  await up(fixture as never);

  const sql = fixture.statements.join("\n");
  for (const fragment of [
    'CREATE TYPE "public"."enum_modules_status"',
    'CREATE TABLE "modules"',
    'CREATE TABLE "_modules_v"',
    'CREATE TABLE "modules_rels"',
    'CREATE TABLE "_modules_v_rels"',
    '"modules_id" integer',
    '"media_id" integer',
    '"trigger_type" "enum_programmes_insight_moments_trigger_type"',
    '"content_type" "enum_tasks_content_type"',
    '"day_number"',
    '"order_within_day"',
    '"publish_slot"',
    '"post_number"',
  ]) {
    assert.ok(sql.includes(fragment), `migration is missing ${fragment}`);
  }

  assert.ok(
    !sql.includes('ALTER TABLE "programmes_rels" ADD COLUMN "modules_id"'),
    "Programme must not keep a second editable Module relationship",
  );
});

test("up preserves the legacy PDF, programme lesson, and task lesson paths", async () => {
  const fixture = database();

  await up(fixture as never);

  const sql = fixture.statements.join("\n");
  assert.match(sql, /lessons_rels/);
  assert.doesNotMatch(
    sql,
    /DROP TABLE "programmes_rels"|DROP COLUMN "lesson_id"/,
    "legacy Programme relationships must remain untouched",
  );
  assert.ok(
    !sql.includes('DROP COLUMN "lesson_id"'),
    "the legacy task lesson relationship must remain",
  );
  assert.match(sql, /pdf_template_id/);
  // Payload names relationship columns after the target collection, so the
  // attachments list lives in lessons_rels.media_id, not attachments_id.
  assert.ok(
    !sql.includes("attachments_id"),
    "relationship column must be media_id, not attachments_id",
  );
  assert.match(
    sql,
    /INSERT INTO "lessons_rels"[\s\S]*'attachments'[\s\S]*"pdf_template_id" IS NOT NULL/,
    "the PDF template must be backfilled before the column is dropped",
  );
});

test("down removes only the new First Take schema pieces", async () => {
  const fixture = database();

  await down(fixture as never);

  const sql = fixture.statements.join("\n");
  assert.match(sql, /DROP TABLE.*modules/s);
  assert.match(sql, /DROP TYPE.*enum_modules_status/s);
  assert.match(sql, /DROP COLUMN.*day_number|day_number.*DROP COLUMN/s);
});
