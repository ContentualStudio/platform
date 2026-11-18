import { MigrationInterface, QueryRunner } from "typeorm";

// The Content Engine's transactional outbox. Write paths insert here inside the
// same transaction as the fact the event describes, so an event can never be
// lost by a crash between the fact commit and the evaluator call, and can never
// be emitted for a fact that rolled back.
//
// The primary key is the caller's stable event ID rather than a generated one:
// that is what makes a replayed request an ON CONFLICT no-op instead of a
// second delivery.
export class ContentEngineEvents1784690000000 implements MigrationInterface {
  name = "ContentEngineEvents1784690000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "content_engine_events" (
        -- Caller-supplied stable identity, e.g.
        -- "programme.started:<userId>:<programmeId>".
        "id" text PRIMARY KEY,
        -- Stored for audit and routing only. The vocabulary package
        -- (packages/content-engine-vocabulary) is the source of truth for the
        -- twelve event tokens, so there is deliberately no CHECK constraint
        -- copying them here — a new event would otherwise need a migration.
        "eventName" text NOT NULL,
        -- Lifted out of the payload so ownership and audit queries are indexed.
        "userId" text NOT NULL,
        "payload" jsonb NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        -- Incremented by the claim rather than the outcome, so a dispatcher
        -- that dies mid-evaluation still backs off on the next attempt.
        "attemptCount" integer NOT NULL DEFAULT 0,
        "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        -- Fencing token: reissued on every claim so a stale dispatcher
        -- finishing late cannot complete a newer holder's claim.
        "claimToken" uuid,
        "claimedUntil" TIMESTAMP WITH TIME ZONE,
        "lastError" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deliveredAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_content_engine_events_status"
          CHECK ("status" IN ('pending', 'delivered'))
      )
    `);

    // Serves the dispatcher's pending sweep: status first because it is the
    // selective predicate once the table has accumulated delivered rows.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_engine_events_pending"
      ON "content_engine_events" ("status", "availableAt")
    `);
    // Audit reads — "what did this event do, and when" — which would otherwise
    // seq-scan the whole outbox.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_engine_events_name_created"
      ON "content_engine_events" ("eventName", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "content_engine_events"`);
  }
}
