import { MigrationInterface, QueryRunner } from "typeorm";

// The firing ledger is the Content Engine's single safety net against duplicate
// badges and repeated prompts. The evaluator reserves a row here before running
// any rule effect; the unique index on (ruleId, userId, scopeKey) is what makes
// a replayed event or a double cron run a no-op.
export class EngineFiringLedger1784600000000 implements MigrationInterface {
  name = "EngineFiringLedger1784600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "engine_firing_ledger" (
        "id" bigserial PRIMARY KEY,
        "ruleId" text NOT NULL,
        "userId" text NOT NULL,
        -- Derived from the rule's dedupe scope, namespaced so a programme id can
        -- never collide with an event id or with the once_per_user constant.
        "scopeKey" text NOT NULL,
        -- Stored for audit only. The vocabulary package
        -- (packages/content-engine-vocabulary) is the source of truth for these
        -- tokens, so there is deliberately no CHECK constraint copying them here.
        "dedupeScope" text NOT NULL,
        "eventRef" text NOT NULL,
        "status" text NOT NULL DEFAULT 'reserved',
        -- Fencing token: reissued on every lease takeover so a stale holder
        -- finishing late cannot complete a newer holder's reservation.
        "leaseToken" uuid NOT NULL,
        "attemptCount" integer NOT NULL DEFAULT 1,
        "reservedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "firedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_engine_firing_ledger_status"
          CHECK ("status" IN ('reserved', 'fired')),
        CONSTRAINT "CHK_engine_firing_ledger_fired"
          CHECK (("status" = 'fired') = ("firedAt" IS NOT NULL)),
        CONSTRAINT "FK_engine_firing_ledger_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The idempotency guarantee. Everything else in this table is bookkeeping.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_engine_firing_ledger_rule_user_scope"
      ON "engine_firing_ledger" ("ruleId", "userId", "scopeKey")
    `);
    // Every lookup the service issues is served by the unique index or the
    // primary key. This one exists solely so deleting a user does not seq-scan
    // the ledger to satisfy the ON DELETE CASCADE, so it carries "userId" alone
    // — a wider index would be maintained on every reservation for no read.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_engine_firing_ledger_user"
      ON "engine_firing_ledger" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "engine_firing_ledger"`);
  }
}
