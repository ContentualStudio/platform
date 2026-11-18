import { MigrationInterface, QueryRunner } from "typeorm";

// Mirror tables hold derived state only: every row is reproducible by running
// the CMS backfill for its collection. They are dropped and recreated rather
// than altered, because the source of truth is always Payload.
const mirrorTables = [
  "studio_lessons",
  "programme",
  "programme_tasks",
  "engine_rules",
];

const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

// Shared projection envelope. Every mirror carries the source document id it is
// keyed on, the source revision it was built from, and when it was written.
const envelopeColumns = `
  "sourceDocumentId" text NOT NULL,
  "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "mirroredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
`;

export class ContentMirrors1784540000000 implements MigrationInterface {
  name = "ContentMirrors1784540000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // An earlier revision of this migration created these as generic jsonb
    // blobs, and named the programme mirror "programmes". Drop both shapes so
    // a database that ran it converges on the typed schema below.
    await queryRunner.query(`DROP TABLE IF EXISTS "programmes"`);

    for (const table of mirrorTables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    await queryRunner.query(`
      CREATE TABLE "studio_lessons" (
        ${envelopeColumns},
        "slug" text NOT NULL,
        "title" text NOT NULL,
        "summary" text,
        "body" jsonb,
        "pdfTemplateId" text,
        CONSTRAINT "PK_studio_lessons" PRIMARY KEY ("sourceDocumentId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_studio_lessons_slug"
      ON "studio_lessons" ("slug")
    `);

    await queryRunner.query(`
      CREATE TABLE "programme" (
        ${envelopeColumns},
        "slug" text NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "lessonIds" text array NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_programme" PRIMARY KEY ("sourceDocumentId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_slug" ON "programme" ("slug")
    `);

    await queryRunner.query(`
      CREATE TABLE "programme_tasks" (
        ${envelopeColumns},
        "slug" text NOT NULL,
        "title" text NOT NULL,
        "instructions" jsonb,
        "lessonId" text,
        CONSTRAINT "PK_programme_tasks" PRIMARY KEY ("sourceDocumentId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_tasks_slug"
      ON "programme_tasks" ("slug")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_tasks_lesson"
      ON "programme_tasks" ("lessonId")
    `);

    await queryRunner.query(`
      CREATE TABLE "engine_rules" (
        ${envelopeColumns},
        "key" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "rules" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_engine_rules" PRIMARY KEY ("sourceDocumentId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_engine_rules_key" ON "engine_rules" ("key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "content_mirror_sync_events" (
        "id" bigserial PRIMARY KEY,
        "collection" text NOT NULL,
        "sourceDocumentId" text,
        "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE,
        "operation" text NOT NULL,
        "status" text NOT NULL,
        "payloadJobId" text,
        "error" text,
        "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_content_mirror_sync_events_operation"
          CHECK ("operation" IN ('upsert', 'delete', 'backfill')),
        CONSTRAINT "CHK_content_mirror_sync_events_status"
          CHECK ("status" IN ('succeeded', 'failed'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_mirror_sync_events_document"
      ON "content_mirror_sync_events" ("collection", "sourceDocumentId", "completedAt" DESC)
    `);

    // Two group roles carry the mirror privileges. The CMS login role is
    // granted the writer, the API login role the reader, so the credential in
    // APP_MIRROR_DATABASE_URL can never reach the rest of the app schema.
    // Table owners bypass grants, so enforcement is only real when the login
    // roles are not the owner of these tables. See docs/cms.md.
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

    const writableTables = [...mirrorTables, "content_mirror_sync_events"];

    for (const table of writableTables) {
      await queryRunner.query(
        `REVOKE ALL ON "${table}" FROM PUBLIC`,
      );
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${MIRROR_WRITER_ROLE}"`,
      );
      await queryRunner.query(
        `GRANT SELECT ON "${table}" TO "${MIRROR_READER_ROLE}"`,
      );
    }

    // The events table's bigserial needs its sequence too.
    await queryRunner.query(`
      GRANT USAGE, SELECT ON SEQUENCE "content_mirror_sync_events_id_seq"
      TO "${MIRROR_WRITER_ROLE}"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "content_mirror_sync_events"`,
    );

    for (const table of [...mirrorTables].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    // Roles are dropped last: Postgres refuses while grants still reference them.
    for (const role of [MIRROR_READER_ROLE, MIRROR_WRITER_ROLE]) {
      await queryRunner.query(`DROP ROLE IF EXISTS "${role}"`);
    }
  }
}
