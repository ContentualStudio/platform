import { MigrationInterface, QueryRunner } from "typeorm";

// Replaces the placeholder engine_rules payload with the evaluator-shaped
// columns the CMS now projects, and adds the two effect-target catalogues.
//
// Forward-only: 1784540000000-ContentMirrors has already run everywhere, so its
// engine_rules shape is altered here rather than edited there.
const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

// Same envelope as every other mirror table: the source document id it is keyed
// on, the source revision it was built from, and when it was written.
const envelopeColumns = `
  "sourceDocumentId" text NOT NULL,
  "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "mirroredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
`;

const catalogueTables = ["engine_badges", "engine_call_types"];

export class EngineRuleAuthoringMirror1784680000000
  implements MigrationInterface
{
  name = "EngineRuleAuthoringMirror1784680000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The placeholder JSON shape cannot be converted reliably into the typed
    // evaluator shape. Refuse to discard a populated mirror: operators must
    // confirm its source documents can be republished/backfilled, clear it
    // deliberately, and rerun the migration.
    const countResult = (await queryRunner.query(
      `SELECT COUNT(*)::integer AS "count" FROM "engine_rules"`,
    )) as Array<{ count: number | string }>;
    const legacyRowCount = Number(countResult[0]?.count ?? 0);

    if (legacyRowCount > 0) {
      throw new Error(
        `Cannot migrate engine_rules: engine_rules contains ${legacyRowCount} legacy ${legacyRowCount === 1 ? "row" : "rows"}. ` +
          "Clear the derived mirror only after confirming Payload can rebuild it, then rerun the migration.",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "engine_rules" DROP COLUMN IF EXISTS "rules"`,
    );
    await queryRunner.query(`
      ALTER TABLE "engine_rules"
        ADD COLUMN "triggerEvent" text NOT NULL,
        ADD COLUMN "conditions" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN "effectType" text NOT NULL,
        ADD COLUMN "effectParams" jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN "dedupeScope" text NOT NULL,
        ADD COLUMN "active" boolean NOT NULL DEFAULT false
    `);

    // The evaluator's hot path is "which active rules listen for this event".
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_rules_trigger_active"
      ON "engine_rules" ("triggerEvent", "active")
    `);

    for (const table of catalogueTables) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          ${envelopeColumns},
          "key" text NOT NULL,
          "name" text NOT NULL,
          "description" text,
          "active" boolean NOT NULL DEFAULT false,
          CONSTRAINT "PK_${table}" PRIMARY KEY ("sourceDocumentId")
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_${table}_key" ON "${table}" ("key")
      `);

      // Same authorization boundary as the existing mirrors: the CMS credential
      // writes, the API credential only reads.
      await queryRunner.query(`REVOKE ALL ON "${table}" FROM PUBLIC`);
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${MIRROR_WRITER_ROLE}"`,
      );
      await queryRunner.query(
        `GRANT SELECT ON "${table}" TO "${MIRROR_READER_ROLE}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...catalogueTables].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_engine_rules_trigger_active"`,
    );
    await queryRunner.query(`DELETE FROM "engine_rules"`);
    await queryRunner.query(`
      ALTER TABLE "engine_rules"
        DROP COLUMN IF EXISTS "triggerEvent",
        DROP COLUMN IF EXISTS "conditions",
        DROP COLUMN IF EXISTS "effectType",
        DROP COLUMN IF EXISTS "effectParams",
        DROP COLUMN IF EXISTS "dedupeScope",
        DROP COLUMN IF EXISTS "active"
    `);
    await queryRunner.query(`
      ALTER TABLE "engine_rules"
        ADD COLUMN "rules" jsonb NOT NULL DEFAULT '{}'
    `);
  }
}
