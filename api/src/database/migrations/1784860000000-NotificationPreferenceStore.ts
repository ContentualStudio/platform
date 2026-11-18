import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationPreferenceStore1784860000000
  implements MigrationInterface
{
  name = "NotificationPreferenceStore1784860000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_preference" (
        "userId" text NOT NULL,
        "notificationType" text NOT NULL,
        "channel" text NOT NULL,
        "optedOut" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preference" PRIMARY KEY ("userId", "notificationType", "channel"),
        CONSTRAINT "FK_notification_preference_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_notification_preference_channel" CHECK ("channel" IN ('in_app', 'email'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_preference_user" ON "notification_preference" ("userId")`,
    );

    await queryRunner.query(`
      INSERT INTO "notification_preference" ("userId", "notificationType", "channel", "optedOut")
      SELECT "userId", "notificationType", "channel", NOT "preferenceValue"
      FROM "user_profile"
      CROSS JOIN LATERAL (
        VALUES
          ('daily_task_notice', 'in_app', "dailyTaskNotice"),
          ('daily_task_notice', 'email', "dailyTaskNotice"),
          ('badge_earned', 'in_app', "badgeEarned"),
          ('streak_at_risk', 'in_app', "streakAtRisk"),
          ('streak_at_risk', 'email', "streakAtRisk"),
          ('milestone_reached', 'in_app', "milestoneReached"),
          ('milestone_reached', 'email', "milestoneReached")
      ) AS legacy("notificationType", "channel", "preferenceValue")
      ON CONFLICT ("userId", "notificationType", "channel") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_preference_user"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_preference"`,
    );
  }
}
