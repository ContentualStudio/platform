import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Logged support actions on a user, in the admin audit log.
 *
 * The log already snapshots actor and target emails; a support entry also
 * names the target user, the reason the admin gave, and a before/after detail
 * of what changed. `targetUserId` is SET NULL on user deletion, like
 * `actorId`, so the entry still reads by its email snapshot. Rows stay
 * append-only.
 */
export class AdminSupportActions1785210000000 implements MigrationInterface {
  name = "AdminSupportActions1785210000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin_audit_log"
        ADD COLUMN "targetUserId" text
          CONSTRAINT "FK_admin_audit_log_target_user"
          REFERENCES "user" ("id") ON DELETE SET NULL,
        ADD COLUMN "reason" text,
        ADD COLUMN "detail" jsonb
    `);
    await queryRunner.query(
      `ALTER TABLE "admin_audit_log" DROP CONSTRAINT "CHK_admin_audit_log_action"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_audit_log"
        ADD CONSTRAINT "CHK_admin_audit_log_action"
          CHECK ("action" IN (
            'admin.invited',
            'admin.removed',
            'support.founding_granted',
            'support.founding_unflagged',
            'support.programme_released'
          )),
        ADD CONSTRAINT "CHK_admin_audit_log_support_fields"
          CHECK ("action" NOT LIKE 'support.%' OR ("reason" IS NOT NULL AND "detail" IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_admin_audit_log_target_user"
        ON "admin_audit_log" ("targetUserId", "createdAt" DESC)
        WHERE "targetUserId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_audit_log" WHERE "action" LIKE 'support.%'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_audit_log_target_user"`);
    await queryRunner.query(`
      ALTER TABLE "admin_audit_log"
        DROP CONSTRAINT "CHK_admin_audit_log_support_fields",
        DROP CONSTRAINT "CHK_admin_audit_log_action"
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_audit_log"
        ADD CONSTRAINT "CHK_admin_audit_log_action"
          CHECK ("action" IN ('admin.invited', 'admin.removed'))
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_audit_log"
        DROP COLUMN "detail",
        DROP COLUMN "reason",
        DROP COLUMN "targetUserId"
    `);
  }
}
