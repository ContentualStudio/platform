import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Two new Stage 2 questionnaire steps: which days of the week the user can
 * create on, and whether they've seen the "tailored content" testimonial
 * interstitial (persisted like any other step so it survives an abandoned
 * session and doesn't re-show on resume).
 */
export class ChallengeSetupStage2Extra1784770000000
  implements MigrationInterface
{
  name = "ChallengeSetupStage2Extra1784770000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD COLUMN IF NOT EXISTS "availableDays" text array,
      ADD COLUMN IF NOT EXISTS "sawTestimonial" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      DROP COLUMN IF EXISTS "availableDays",
      DROP COLUMN IF EXISTS "sawTestimonial"
    `);
  }
}
