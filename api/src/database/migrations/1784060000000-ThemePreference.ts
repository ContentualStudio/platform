import { MigrationInterface, QueryRunner } from "typeorm";

export class ThemePreference1784060000000 implements MigrationInterface {
  name = "ThemePreference1784060000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "themePreference" text NOT NULL DEFAULT 'system'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "themePreference"`,
    );
  }
}
