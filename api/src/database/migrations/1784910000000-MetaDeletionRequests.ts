import { MigrationInterface, QueryRunner } from "typeorm";

// Meta's data-deletion callback has to be answered with a confirmation code the
// platform can look up later, so each request is recorded.
//
// Deliberately no foreign key to "user": the row has to outlive the data it
// erased. A confirmation code that vanished along with the user it refers to
// would be unable to answer the one question it exists to answer.
//
// `externalAccountId` is the join key rather than a user id, because that is
// all Meta sends — the request names an Instagram account, and whether we hold
// a connection for it is something we look up, not something we are told.
export class MetaDeletionRequests1784910000000 implements MigrationInterface {
  name = "MetaDeletionRequests1784910000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meta_deletion_request" (
        "confirmationCode" text PRIMARY KEY,
        "platform" text NOT NULL DEFAULT 'instagram',
        "externalAccountId" text NOT NULL,
        -- Null when no connection matched. That is a valid outcome, not an
        -- error: we still owe Meta a confirmation.
        "userId" text,
        "status" text NOT NULL DEFAULT 'received',
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" text,
        CONSTRAINT "CHK_meta_deletion_request_status"
          CHECK ("status" IN ('received', 'completed', 'no_match', 'failed')),
        CONSTRAINT "CHK_meta_deletion_request_completed"
          CHECK (("status" IN ('completed', 'no_match')) = ("completedAt" IS NOT NULL))
      )
    `);

    // Serves both the idempotency lookup (has this account asked recently?) and
    // the status endpoint's read.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_meta_deletion_request_account"
      ON "meta_deletion_request" ("externalAccountId", "receivedAt" DESC)
    `);

    // The deletion callback resolves the user by Meta's account id, and every
    // index on platform_connection is userId-leading — so without this the one
    // request that must be answered fast is a sequential scan.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_platform_connection_external_account"
      ON "platform_connection" ("externalAccountId", "platform")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_platform_connection_external_account"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "meta_deletion_request"`);
  }
}
