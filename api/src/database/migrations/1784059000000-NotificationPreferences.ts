import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationPreferences1784059000000
  implements MigrationInterface
{
  name = "NotificationPreferences1784059000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "dailyTaskNotice" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "badgeEarned" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "streakAtRisk" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "milestoneReached" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "milestoneReached"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "streakAtRisk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "badgeEarned"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "dailyTaskNotice"`,
    );
  }
}
