import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * What one backfill run did, per user.
 *
 * The firing ledger cannot answer this. It records that a rule fired for a
 * user, not *which* rollout caused it, so counting fired ledger rows for a rule
 * includes everyone who fired live before the backfill ran and everyone an
 * earlier run reached — reporting more users fired than the run had candidates.
 *
 * One row per user per run, so the count is exact, describes this rollout
 * alone, and survives a run being resumed after a crash. A tally held in the
 * worker would do none of the three.
 *
 * `outcomeRank` orders the outcomes so a user seen more than once in a run —
 * several completed programmes, several follower tiers — settles on the
 * strongest thing that happened to them rather than the last one written.
 */
export class ContentEngineBackfillRunUsers1784760000000
  implements MigrationInterface
{
  name = "ContentEngineBackfillRunUsers1784760000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "engine_rule_backfill_run"
      ADD COLUMN "usersSkipped" integer NOT NULL DEFAULT 0,
      ADD COLUMN "usersFailed" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE "engine_rule_backfill_run_user" (
        "runId" uuid NOT NULL,
        "userId" text NOT NULL,
        "outcome" text NOT NULL,
        "outcomeRank" smallint NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT "PK_engine_rule_backfill_run_user"
          PRIMARY KEY ("runId", "userId"),
        CONSTRAINT "FK_engine_rule_backfill_run_user_run"
          FOREIGN KEY ("runId") REFERENCES "engine_rule_backfill_run" ("id")
          ON DELETE CASCADE,
        CONSTRAINT "CHK_engine_rule_backfill_run_user_outcome" CHECK (
          "outcome" IN ('fired', 'failed', 'skipped')
        )
      )
    `);

    // No foreign key to "user". These rows are the audit of an operator action
    // and must not disappear because an account was later deleted — and a
    // cascade from "user" would silently rewrite the history of a rollout.
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_rule_backfill_run_user_outcome"
      ON "engine_rule_backfill_run_user" ("runId", "outcome")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_engine_rule_backfill_run_user_outcome"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "engine_rule_backfill_run_user"`,
    );
    await queryRunner.query(`
      ALTER TABLE "engine_rule_backfill_run"
      DROP COLUMN IF EXISTS "usersFailed",
      DROP COLUMN IF EXISTS "usersSkipped"
    `);
  }
}
