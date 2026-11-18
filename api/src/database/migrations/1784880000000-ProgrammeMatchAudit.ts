import { MigrationInterface, QueryRunner } from "typeorm";

// Audit trail for the assignment the matcher produced: which released
// algorithm version ran, and which leaf of that version's tree answered.
// Together with the already-stored slug they make a past assignment
// explainable after the tree has changed.
//
// Both columns are nullable on purpose. Rows completed before this migration
// were assigned by the superseded scorer; there is no honest version or leaf
// to backfill them with, and inventing one would make the audit trail a
// fiction.
export class ProgrammeMatchAudit1784880000000 implements MigrationInterface {
  name = "ProgrammeMatchAudit1784880000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ADD COLUMN IF NOT EXISTS "matchAlgorithmVersion" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ADD COLUMN IF NOT EXISTS "matchLeafId" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP COLUMN IF EXISTS "matchLeafId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP COLUMN IF EXISTS "matchAlgorithmVersion"`,
    );
  }
}
