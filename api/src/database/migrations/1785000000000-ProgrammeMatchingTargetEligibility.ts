import { MigrationInterface, QueryRunner } from "typeorm";

const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

/**
 * Fail-closed lifecycle boundary shared by CMS publication and retirement.
 * Payload remains the authoring source; this table exists so app-database
 * pointer activation can recheck eligibility inside its own transaction.
 */
export class ProgrammeMatchingTargetEligibility1785000000000
  implements MigrationInterface
{
  name = "ProgrammeMatchingTargetEligibility1785000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_matching_target_eligibility" (
        "sourceDocumentId" text NOT NULL,
        "lifecycleStatus" text NOT NULL,
        "publicationStatus" text NOT NULL,
        "eligible" boolean NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_programme_matching_target_eligibility"
          PRIMARY KEY ("sourceDocumentId")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "programme_matching_target_eligibility"
        ("sourceDocumentId", "lifecycleStatus", "publicationStatus", "eligible")
      SELECT "sourceDocumentId", 'live', 'published', true
      FROM "programme"
      ON CONFLICT ("sourceDocumentId") DO NOTHING
    `);
    await queryRunner.query(
      `REVOKE ALL ON "programme_matching_target_eligibility" FROM PUBLIC`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON "programme_matching_target_eligibility" TO "${MIRROR_WRITER_ROLE}"`,
    );
    await queryRunner.query(
      `GRANT SELECT ON "programme_matching_target_eligibility" TO "${MIRROR_READER_ROLE}"`,
    );
    await queryRunner.query(
      `GRANT SELECT ON "programme_assignment" TO "${MIRROR_WRITER_ROLE}"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `REVOKE SELECT ON "programme_assignment" FROM "${MIRROR_WRITER_ROLE}"`,
    );
    await queryRunner.query(
      `DROP TABLE "programme_matching_target_eligibility"`,
    );
  }
}
