import { MigrationInterface, QueryRunner } from "typeorm";

/** Reproject lessons after deploying CMS sync to populate existing URLs. */
export class LessonTemplateUrl1792400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "studio_lessons" ADD COLUMN "templateUrl" text',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "studio_lessons" DROP COLUMN "templateUrl"',
    );
  }
}
