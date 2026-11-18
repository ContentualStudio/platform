import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lessons gate by tier like programmes: `studio_lessons.paidOnly` becomes
 * `minimumTier`, with existing paid-only lessons mapped to Creator.
 */
export class LessonMinimumTier1785090000000 implements MigrationInterface {
  name = "LessonMinimumTier1785090000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD COLUMN "minimumTier" text NOT NULL DEFAULT 'free'
      CONSTRAINT "CHK_studio_lessons_minimum_tier" CHECK ("minimumTier" IN ('free', 'creator', 'pro'))
    `);
    await queryRunner.query(`
      UPDATE "studio_lessons" SET "minimumTier" = 'creator' WHERE "paidOnly"
    `);
    await queryRunner.query(`ALTER TABLE "studio_lessons" DROP COLUMN "paidOnly"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons" ADD COLUMN "paidOnly" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "studio_lessons" SET "paidOnly" = true WHERE "minimumTier" <> 'free'
    `);
    await queryRunner.query(`ALTER TABLE "studio_lessons" DROP COLUMN "minimumTier"`);
  }
}
