import { MigrationInterface, QueryRunner } from "typeorm";

export class ProfileSettings1784058000000 implements MigrationInterface {
  name = "ProfileSettings1784058000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "bio" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "avatarKey" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "avatarKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "bio"`,
    );
  }
}
