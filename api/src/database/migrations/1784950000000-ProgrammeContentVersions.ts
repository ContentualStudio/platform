import { MigrationInterface, QueryRunner } from "typeorm";

const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

/**
 * Immutable, app-owned copies of published Payload programme graphs.
 *
 * The matching publisher writes these rows before it activates a setup. The
 * normal content mirror may continue to move as Payload changes; assignments
 * never read it once they have a programmeVersionId.
 */
export class ProgrammeContentVersions1784950000000
  implements MigrationInterface
{
  name = "ProgrammeContentVersions1784950000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_content_versions" (
        "programmeVersionId" text PRIMARY KEY,
        "programmeKey" text NOT NULL,
        "sourceDocumentId" text NOT NULL,
        "sourceUpdatedAt" timestamptz NOT NULL,
        "contentHash" text NOT NULL,
        "snapshot" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_content_versions_programme_key"
      ON "programme_content_versions" ("programmeKey", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_content_versions_source_document"
      ON "programme_content_versions" ("sourceDocumentId", "createdAt" DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "reject_programme_content_version_change"()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'Programme content versions are immutable; publish a new version instead.';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_programme_content_versions_immutable"
      BEFORE UPDATE OR DELETE ON "programme_content_versions"
      FOR EACH ROW EXECUTE FUNCTION "reject_programme_content_version_change"()
    `);

    for (const role of [MIRROR_WRITER_ROLE, MIRROR_READER_ROLE]) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
            CREATE ROLE "${role}" NOLOGIN;
          END IF;
        END
        $$
      `);
    }

    await queryRunner.query(
      `REVOKE ALL ON "programme_content_versions" FROM PUBLIC`,
    );
    await queryRunner.query(
      `REVOKE UPDATE, DELETE ON "programme_content_versions" FROM "${MIRROR_WRITER_ROLE}"`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT ON "programme_content_versions" TO "${MIRROR_WRITER_ROLE}"`,
    );
    await queryRunner.query(
      `GRANT SELECT ON "programme_content_versions" TO "${MIRROR_READER_ROLE}"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_programme_content_versions_immutable" ON "programme_content_versions"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "reject_programme_content_version_change"()`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_programme_content_versions_source_document"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_programme_content_versions_programme_key"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "programme_content_versions"`,
    );
  }
}
