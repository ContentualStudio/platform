import { MigrationInterface, QueryRunner } from "typeorm";

/** Keeps completion history explainable after a programme is republished. */
export class ProgrammeVersionedCompletion1784980000000
  implements MigrationInterface
{
  name = "ProgrammeVersionedCompletion1784980000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme_completion"
      ADD COLUMN IF NOT EXISTS "programmeVersionId" text
    `);
    await queryRunner.query(`
      UPDATE "programme_completion" completion
      SET "programmeVersionId" = setup."assignedProgrammeVersionId"
      FROM "challenge_setup" setup
      WHERE completion."userId" = setup."userId"
        AND completion."programmeId" = setup."assignedProgrammeId"
        AND completion."programmeVersionId" IS NULL
        AND setup."assignedProgrammeVersionId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "programme_completion" DROP COLUMN IF EXISTS "programmeVersionId"`,
    );
  }
}
