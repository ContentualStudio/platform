import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The durable record of an on-demand rule backfill.
 *
 * A backfill is triggered by an operator and then runs for as long as it takes,
 * which is exactly the shape of work that must not live in one process. Without
 * this table a disconnect or a deploy loses the operator's request, the progress
 * made, and any record that the rollout happened at all — and a rerun would
 * restart the scan from the beginning.
 *
 * `cursor` is what makes a run resumable: a worker claims the row, scans from
 * the stored keyset position, and writes the new position back after every page.
 * A crash costs at most one page.
 *
 * There is deliberately no foreign key to `engine_rules`. That table is a
 * CMS-owned mirror this service only reads, and a rule unpublished after its
 * backfill ran must not take the record of the rollout with it.
 */
export class ContentEngineBackfillRuns1784750000000
  implements MigrationInterface
{
  name = "ContentEngineBackfillRuns1784750000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "engine_rule_backfill_run" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ruleId" text NOT NULL,
        "status" text NOT NULL DEFAULT 'queued',
        "requestedBy" text,

        "pageSize" integer NOT NULL,
        "pauseMs" integer NOT NULL,
        "maxCandidates" integer NOT NULL,
        "dryRun" boolean NOT NULL DEFAULT false,

        -- The keyset position the next page resumes from. NULL before the first
        -- page and after the last one; "stoppedBecause" distinguishes the two.
        "cursor" text,

        "candidatesScanned" integer NOT NULL DEFAULT 0,
        "candidatesFired" integer NOT NULL DEFAULT 0,
        "candidatesSkipped" integer NOT NULL DEFAULT 0,
        "candidatesFailed" integer NOT NULL DEFAULT 0,

        -- Counted from the firing ledger rather than from a set held in memory,
        -- so a resumed run reports the same numbers a single-pass run would.
        "usersInScope" integer,
        "usersFired" integer,

        "skippedReasons" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "failures" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "stoppedBecause" text,
        "refusal" text,
        "lastError" text,

        -- Fenced the same way the firing ledger fences a reservation: a worker
        -- whose lease was taken over presents a superseded token and cannot
        -- write progress over the new holder's.
        "leaseToken" uuid,
        "claimedAt" TIMESTAMP WITH TIME ZONE,

        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "finishedAt" TIMESTAMP WITH TIME ZONE,

        CONSTRAINT "PK_engine_rule_backfill_run" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_engine_rule_backfill_run_status" CHECK (
          "status" IN ('queued', 'running', 'succeeded', 'failed', 'refused')
        )
      )
    `);

    // At most one live run per rule. Two workers scanning the same rule would
    // duplicate every reservation attempt and halve the throughput of both for
    // no benefit — the ledger would dedupe the effects, but the load is real.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_engine_rule_backfill_run_live"
      ON "engine_rule_backfill_run" ("ruleId")
      WHERE "status" IN ('queued', 'running')
    `);

    // The claim query's access path: oldest queued first.
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_rule_backfill_run_claimable"
      ON "engine_rule_backfill_run" ("status", "createdAt")
    `);

    // How the admin view lists a rule's history.
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_rule_backfill_run_rule"
      ON "engine_rule_backfill_run" ("ruleId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_engine_rule_backfill_run_rule"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_engine_rule_backfill_run_claimable"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_engine_rule_backfill_run_live"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "engine_rule_backfill_run"`);
  }
}
