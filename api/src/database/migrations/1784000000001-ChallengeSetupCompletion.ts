import { MigrationInterface, QueryRunner } from "typeorm";

export class ChallengeSetupCompletion1784000000001 implements MigrationInterface {
  name = "ChallengeSetupCompletion1784000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ADD COLUMN IF NOT EXISTS "programmeAssignedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ALTER COLUMN "instagramConnected" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ALTER COLUMN "instagramConnected" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "challenge_setup" SET "instagramConnected" = false WHERE "instagramConnected" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ALTER COLUMN "instagramConnected" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ALTER COLUMN "instagramConnected" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP COLUMN IF EXISTS "programmeAssignedAt"`,
    );
  }
}
