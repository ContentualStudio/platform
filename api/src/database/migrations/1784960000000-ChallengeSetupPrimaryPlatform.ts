import { MigrationInterface, QueryRunner } from "typeorm";

export class ChallengeSetupPrimaryPlatform1784960000000
  implements MigrationInterface
{
  name = "ChallengeSetupPrimaryPlatform1784960000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD COLUMN "primaryPlatform" text
    `);
    // The old flow preserved selection order but never asked which platform
    // was primary. PostgreSQL arrays are one-indexed; the first selected value
    // is the only deterministic backfill available for those legacy rows.
    await queryRunner.query(`
      UPDATE "challenge_setup"
      SET "primaryPlatform" = "platforms"[1]
      WHERE "primaryPlatform" IS NULL
        AND cardinality("platforms") = 2
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      DROP COLUMN IF EXISTS "primaryPlatform"
    `);
  }
}
