import { MigrationInterface, QueryRunner } from "typeorm";

export class InAppNotificationInbox1784870000000
  implements MigrationInterface
{
  name = "InAppNotificationInbox1784870000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "in_app_notification" (
        "id" bigserial NOT NULL,
        "userId" text NOT NULL,
        "notificationType" text,
        "title" text NOT NULL,
        "message" text NOT NULL,
        "actionUrl" text,
        "dedupeKey" text NOT NULL,
        "sourceEngineMessageId" bigint,
        "sourceRuleId" text,
        "sourceEventId" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "readAt" TIMESTAMP WITH TIME ZONE,
        "dismissedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_in_app_notification" PRIMARY KEY ("id"),
        CONSTRAINT "FK_in_app_notification_user"
          FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_in_app_notification_engine_message"
          FOREIGN KEY ("sourceEngineMessageId")
          REFERENCES "engine_in_app_message" ("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_in_app_notification_type"
          CHECK ("notificationType" IS NULL OR "notificationType" IN (
            'daily_task_notice', 'badge_earned', 'streak_at_risk', 'milestone_reached'
          )),
        CONSTRAINT "CHK_in_app_notification_action_url"
          CHECK ("actionUrl" IS NULL OR (
            "actionUrl" LIKE '/%'
            AND "actionUrl" NOT LIKE '//%'
            AND "actionUrl" = btrim("actionUrl")
            AND position('%' in "actionUrl") = 0
            AND position(chr(92) in "actionUrl") = 0
            AND "actionUrl" !~ '[[:cntrl:]]'
            AND position(chr(8232) in "actionUrl") = 0
            AND position(chr(8233) in "actionUrl") = 0
          ))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_in_app_notification_user_dedupe" ON "in_app_notification" ("userId", "dedupeKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_in_app_notification_inbox" ON "in_app_notification" ("userId", "dismissedAt", "createdAt", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_in_app_notification_unread" ON "in_app_notification" ("userId", "dismissedAt", "readAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_in_app_notification_unread"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_in_app_notification_inbox"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_in_app_notification_user_dedupe"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "in_app_notification"`,
    );
  }
}
