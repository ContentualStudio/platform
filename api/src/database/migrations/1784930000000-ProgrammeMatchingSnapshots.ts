import { MigrationInterface, QueryRunner } from "typeorm";

// The same two group roles the content mirror uses (see
// 1784540000000-ContentMirrors): the CMS login role holds the writer, the API
// login role the reader. Matching setups are written by the CMS and read by the
// API, so they belong under exactly that split.
const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

// Read by the API on the completion path, written by the CMS at publication.
const PUBLISHED_SETUP_TABLES = [
  "programme_matching_setup_versions",
  "programme_matching_rules",
  "active_programme_matching_setup",
  "matching_publication_attempts",
];

/**
 * The app-side home of CMS-authored programme matching.
 *
 * Payload remains where rules are written; these tables are where a *published*
 * setup lands. Runtime matching reads nothing else — not Payload, not a mirror
 * job queue — which is what makes an assignment reproducible from the database
 * alone months after the rules moved on.
 *
 * Three invariants are enforced here rather than in application code, because
 * they are the ones that decide whether a user gets a programme at all:
 *
 *   1. A published version can never be edited. Rewriting the rules a past
 *      assignment cites would turn its stored trace into a fiction, so UPDATE
 *      is refused by trigger, not by convention.
 *   2. Exactly one fallback per version, and no two active normal rules sharing
 *      a priority. Publication validates both; the partial unique indexes mean
 *      a bug in that validator cannot produce an unorderable setup.
 *   3. Exactly one active setup, ever. The pointer table is a single row by
 *      construction, so "which rules are live" has one answer and swapping it
 *      is one UPDATE.
 */
export class ProgrammeMatchingSnapshots1784930000000
  implements MigrationInterface
{
  name = "ProgrammeMatchingSnapshots1784930000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_matching_setup_versions" (
        "setupVersionId" text PRIMARY KEY,
        "sourceDocumentId" text NOT NULL,
        "label" text NOT NULL,
        "publishedAt" timestamptz NOT NULL,
        "publishedBy" text,
        -- Set when this version was created by restoring an earlier one.
        -- Restore publishes a new immutable version rather than reactivating
        -- the old row, so history stays append-only and the provenance is
        -- still legible.
        "restoredFromVersionId" text
          REFERENCES "programme_matching_setup_versions" ("setupVersionId"),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_matching_setup_versions_published_at"
      ON "programme_matching_setup_versions" ("publishedAt" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "programme_matching_rules" (
        "setupVersionId" text NOT NULL
          REFERENCES "programme_matching_setup_versions" ("setupVersionId")
          ON DELETE CASCADE,
        "ruleId" text NOT NULL,
        "name" text NOT NULL,
        "programmeKey" text NOT NULL,
        "programmeVersionId" text NOT NULL,
        "active" boolean NOT NULL,
        "priority" integer,
        "fallback" boolean NOT NULL,
        "explanation" text NOT NULL,
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "position" integer NOT NULL,
        PRIMARY KEY ("setupVersionId", "ruleId"),
        CONSTRAINT "CHK_matching_rule_priority_positive"
          CHECK ("priority" IS NULL OR "priority" > 0),
        -- The fallback answers "everyone else": conditions or a priority on it
        -- would make it an ordinary rule wearing the wrong label.
        CONSTRAINT "CHK_matching_rule_fallback_shape"
          CHECK (
            NOT "fallback"
            OR ("priority" IS NULL AND "conditions" = '[]'::jsonb)
          ),
        CONSTRAINT "CHK_matching_rule_normal_shape"
          CHECK (
            "fallback"
            OR ("priority" IS NOT NULL AND jsonb_array_length("conditions") > 0)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_matching_rules_one_fallback_per_version"
      ON "programme_matching_rules" ("setupVersionId")
      WHERE "fallback"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_matching_rules_active_priority"
      ON "programme_matching_rules" ("setupVersionId", "priority")
      WHERE "active" AND NOT "fallback"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_matching_rules_version_position"
      ON "programme_matching_rules" ("setupVersionId", "position")
    `);

    await queryRunner.query(`
      CREATE TABLE "active_programme_matching_setup" (
        -- One row, forever. The CHECK on a boolean primary key is what makes
        -- "there is exactly one active setup" a property of the schema instead
        -- of something every reader has to hope for.
        "id" boolean PRIMARY KEY DEFAULT true,
        "setupVersionId" text NOT NULL
          REFERENCES "programme_matching_setup_versions" ("setupVersionId"),
        "activatedAt" timestamptz NOT NULL DEFAULT now(),
        "activatedBy" text,
        CONSTRAINT "CHK_active_matching_setup_singleton" CHECK ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "matching_publication_attempts" (
        "id" bigserial PRIMARY KEY,
        "sourceDocumentId" text,
        "setupVersionId" text,
        "outcome" text NOT NULL,
        "reasonCode" text,
        -- Plain-language, rule-addressed rejections, exactly as the operator
        -- saw them. Stored so "why did publishing fail last Tuesday" is
        -- answerable without reproducing the draft.
        "errors" jsonb NOT NULL DEFAULT '[]',
        "actor" text,
        "correlationId" text,
        "attemptedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_matching_publication_outcome"
          CHECK ("outcome" IN ('published', 'rejected', 'failed'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_matching_publication_attempts_attempted_at"
      ON "matching_publication_attempts" ("attemptedAt" DESC)
    `);

    // Immutability, enforced where it cannot be forgotten. A published version
    // is cited by every assignment made under it; an UPDATE here would rewrite
    // history retroactively for all of them.
    //
    // UPDATE and DELETE are both refused. The active pointer protects only the
    // currently live row; it does not protect an older row whose rules an
    // assignment history still cites. A privileged database user must publish
    // a new version or use a separate, reviewed retention process rather than
    // deleting history through ordinary DML.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "reject_published_matching_change"()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'Published matching setups are immutable; publish a new version instead.';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_matching_setup_versions_immutable"
      BEFORE UPDATE OR DELETE ON "programme_matching_setup_versions"
      FOR EACH ROW EXECUTE FUNCTION "reject_published_matching_change"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_matching_rules_immutable"
      BEFORE UPDATE OR DELETE ON "programme_matching_rules"
      FOR EACH ROW EXECUTE FUNCTION "reject_published_matching_change"()
    `);

    await this.grantMirrorRoles(queryRunner);
  }

  // Without these the CMS cannot publish at all under the intended production
  // credential: the connection in APP_MIRROR_DATABASE_URL holds the writer role
  // and nothing else, so a table with no grant is a permission error at the
  // first INSERT.
  //
  // The roles are created by the content-mirror migration, which runs first.
  // The guard is here anyway so this migration still applies on a database
  // where they were dropped by hand.
  private async grantMirrorRoles(queryRunner: QueryRunner): Promise<void> {
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

    for (const table of PUBLISHED_SETUP_TABLES) {
      await queryRunner.query(`REVOKE ALL ON "${table}" FROM PUBLIC`);
      // Deliberately no UPDATE or DELETE on the version and rule tables: a
      // published version is immutable, and the privilege that cannot be
      // exercised is better not granted. The active pointer is the one thing a
      // publication legitimately rewrites.
      await queryRunner.query(
        `GRANT SELECT, INSERT ON "${table}" TO "${MIRROR_WRITER_ROLE}"`,
      );
      await queryRunner.query(
        `GRANT SELECT ON "${table}" TO "${MIRROR_READER_ROLE}"`,
      );
    }

    await queryRunner.query(`
      GRANT UPDATE ON "active_programme_matching_setup"
      TO "${MIRROR_WRITER_ROLE}"
    `);

    // The attempts table's bigserial needs its sequence too.
    await queryRunner.query(`
      GRANT USAGE, SELECT ON SEQUENCE "matching_publication_attempts_id_seq"
      TO "${MIRROR_WRITER_ROLE}"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_matching_rules_immutable" ON "programme_matching_rules"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_matching_setup_versions_immutable" ON "programme_matching_setup_versions"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "reject_published_matching_change"()`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "matching_publication_attempts"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "active_programme_matching_setup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_matching_rules"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "programme_matching_setup_versions"`,
    );
  }
}
