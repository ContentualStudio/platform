import type { MigrationInterface, QueryRunner } from "typeorm";

export class CompletionSuggestionResolution1793050000000 implements MigrationInterface {
  name = "CompletionSuggestionResolution1793050000000";
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE "engine_rules" ADD COLUMN "priority" integer NOT NULL DEFAULT 100',
    );
    await runner.query(
      'ALTER TABLE "engine_programme_suggestion" ADD COLUMN "priority" integer NOT NULL DEFAULT 100',
    );
    await runner.query(`CREATE TABLE "programme_completion_suggestion" (
      "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      "eventId" text NOT NULL,
      "suggestionId" bigint REFERENCES "engine_programme_suggestion" ("id") ON DELETE CASCADE,
      "programmeSlug" text,
      "createdAt" timestamptz NOT NULL,
      PRIMARY KEY ("userId", "eventId"),
      CHECK (("suggestionId" IS NULL) = ("programmeSlug" IS NULL))
    )`);
    // Preserve the candidate users could already see under the old newest-wins
    // policy. Re-ranking historical events could resurrect a dismissed loser.
    // New completions use the priority resolver; delivered history is frozen.
    await runner.query(`
      INSERT INTO "programme_completion_suggestion"
        ("userId", "eventId", "suggestionId", "programmeSlug", "createdAt")
      SELECT e."userId", e."id",
        CASE WHEN eligible."eligible" = true THEN newest."id" END,
        CASE WHEN eligible."eligible" = true THEN p."slug" END,
        e."createdAt"
      FROM "content_engine_events" e
      LEFT JOIN LATERAL (
        SELECT s."id", s."programmeId"
        FROM "engine_programme_suggestion" s
        WHERE s."userId" = e."userId" AND s."eventId" = e."id"
        ORDER BY s."createdAt" DESC, s."id" DESC LIMIT 1
      ) newest ON true
      LEFT JOIN "programme" p ON p."sourceDocumentId" = newest."programmeId"
      LEFT JOIN "programme_matching_target_eligibility" eligible
        ON eligible."sourceDocumentId" = p."sourceDocumentId"
      WHERE e."eventName" = 'programme.completed' AND e."status" = 'delivered'
    `);
    await runner.query(
      'CREATE INDEX "IDX_completion_suggestion_user_created" ON "programme_completion_suggestion" ("userId", "createdAt" DESC, "eventId")',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "programme_completion_suggestion"');
    await runner.query(
      'ALTER TABLE "engine_programme_suggestion" DROP COLUMN "priority"',
    );
    await runner.query('ALTER TABLE "engine_rules" DROP COLUMN "priority"');
  }
}
