import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Repairs the two columns `ContentEngineBackfillRunUsers1784760000000` was
 * meant to add.
 *
 * That migration was edited after it had already been recorded as executed, so
 * the `ALTER TABLE` it grew was never applied to any database that had run the
 * earlier version — leaving `RuleBackfillWorker` to fail every tick with
 * `column "usersSkipped" does not exist`.
 *
 * `IF NOT EXISTS` because databases created after the edit already have both
 * columns and must be left alone.
 */
export class BackfillRunUserCountsBackfill1785060000000
  implements MigrationInterface
{
  name = "BackfillRunUserCountsBackfill1785060000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "engine_rule_backfill_run"
      ADD COLUMN IF NOT EXISTS "usersSkipped" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "usersFailed" integer NOT NULL DEFAULT 0
    `);
  }

  // No down. Dropping the columns would break the running worker, and the
  // migration that owns them already drops them on its own revert.
  public async down(): Promise<void> {}
}
