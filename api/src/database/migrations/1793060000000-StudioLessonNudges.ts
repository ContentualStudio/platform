import type { MigrationInterface, QueryRunner } from "typeorm";

export class StudioLessonNudges1793060000000 implements MigrationInterface {
  name = "StudioLessonNudges1793060000000";
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "studio_lesson_nudges" (
      "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      "programmeId" text NOT NULL,
      "contentType" text NOT NULL,
      "shownAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("userId", "programmeId", "contentType")
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "studio_lesson_nudges"');
  }
}
