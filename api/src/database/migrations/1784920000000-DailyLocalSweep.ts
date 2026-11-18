import { MigrationInterface, QueryRunner } from "typeorm";

// The queue behind "serve every user at 7am their time".
//
// One row per user per job per *local* day. That unique index is the whole
// idempotency guarantee: the sweep can tick every minute, on any number of
// replicas, and a user is still served once a day. Nothing else in the design
// has to be careful about double-running, because the insert simply loses.
//
// It also makes the two awkward days harmless. When the clocks go back, 07:00
// happens twice and the second insert conflicts; when they go forward it may
// not happen at all, and the row is created by the first tick past the hour.
//
// The claim/lease columns mirror `engine_rule_backfill_run` — the same
// FOR UPDATE SKIP LOCKED plus fencing token that lets a crashed worker's row be
// taken over rather than being stuck forever.
export class DailyLocalSweep1784920000000 implements MigrationInterface {
  name = "DailyLocalSweep1784920000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_local_sweep_run" (
        "id" bigserial PRIMARY KEY,
        "jobName" text NOT NULL,
        "userId" text NOT NULL,
        "localDate" date NOT NULL,
        "status" text NOT NULL DEFAULT 'due',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "leaseToken" uuid,
        "claimedAt" TIMESTAMP WITH TIME ZONE,
        "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastError" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finishedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_daily_local_sweep_run_status"
          CHECK ("status" IN ('due', 'running', 'succeeded', 'failed', 'skipped')),
        CONSTRAINT "FK_daily_local_sweep_run_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The idempotency guarantee. Everything else here is bookkeeping.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_daily_local_sweep_run_day"
      ON "daily_local_sweep_run" ("jobName", "userId", "localDate")
    `);

    // The claim's read: due work for this job, oldest first.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_daily_local_sweep_run_claimable"
      ON "daily_local_sweep_run" ("jobName", "status", "availableAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_local_sweep_run"`);
  }
}
