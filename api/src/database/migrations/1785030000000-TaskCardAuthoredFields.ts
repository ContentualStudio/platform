import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The five authored fields the daily task card renders that the mirror did not
 * carry: platform, camera flag, objective, opening line and why-it-matters.
 *
 * Additive and nullable throughout — every task already published predates
 * these fields, and the card omits whatever a task does not carry, so there is
 * nothing to backfill. `cameraRequired` follows `publishSlot` in being NOT NULL
 * with a false default, because "no camera needed" and "not yet answered" mean
 * the same thing to a creator reading the card.
 *
 * Grants are table-level (see 1784800000000-FirstTakeContentMirrors), so the
 * mirror writer and reader roles pick these columns up without a new GRANT.
 */
export class TaskCardAuthoredFields1785030000000 implements MigrationInterface {
  name = "TaskCardAuthoredFields1785030000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      ADD COLUMN "platform" text,
      ADD COLUMN "cameraRequired" boolean NOT NULL DEFAULT false,
      ADD COLUMN "objective" text,
      ADD COLUMN "openingLine" text,
      ADD COLUMN "whyItMatters" jsonb
    `);

    // The same fail-closed vocabulary gate the other authored enums get: a
    // mirror row whose platform the card cannot render is drift, not content.
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      ADD CONSTRAINT "CHK_programme_tasks_platform"
      CHECK (
        "platform" IS NULL
        OR "platform" IN (
          'instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'pinterest'
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_platform"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      DROP COLUMN IF EXISTS "platform",
      DROP COLUMN IF EXISTS "cameraRequired",
      DROP COLUMN IF EXISTS "objective",
      DROP COLUMN IF EXISTS "openingLine",
      DROP COLUMN IF EXISTS "whyItMatters"
    `);
  }
}
