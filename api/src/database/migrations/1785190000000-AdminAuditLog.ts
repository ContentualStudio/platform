import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The internal admin's team-change audit log.
 *
 * Append-only: nothing updates or deletes its rows. It snapshots the actor's
 * and target's emails as text, so an entry — and the "added by" the Team list
 * derives from it — still reads correctly after either account is removed;
 * `actorId` alone would dangle. Accounts the `admin:account` script creates
 * have no entry, which is how the list tells them apart.
 */
export class AdminAuditLog1785190000000 implements MigrationInterface {
  name = "AdminAuditLog1785190000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_audit_log" (
        "id" bigserial PRIMARY KEY,
        "action" text NOT NULL,
        "actorId" text
          CONSTRAINT "FK_admin_audit_log_actor"
          REFERENCES "admin_account" ("id") ON DELETE SET NULL,
        "actorEmail" text NOT NULL,
        "targetEmail" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_admin_audit_log_action"
          CHECK ("action" IN ('admin.invited', 'admin.removed'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_log_created" ON "admin_audit_log" ("createdAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_log"`);
  }
}
