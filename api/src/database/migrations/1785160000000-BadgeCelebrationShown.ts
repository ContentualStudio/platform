import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * When the user was actually shown a released badge's celebration.
 *
 * Release and display are separate moments: the processor releases a badge
 * whether or not the user is online, and the takeover appears when they next
 * are. A released row with no `shownAt` is a celebration still owed — which is
 * what makes a release never silently dropped, and a dismissed one never shown
 * twice.
 */
export class BadgeCelebrationShown1785160000000 implements MigrationInterface {
  name = "BadgeCelebrationShown1785160000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "badge_cooldown_queue"
        ADD COLUMN "shownAt" TIMESTAMP WITH TIME ZONE
    `);
    // The session-start read: this user's released, not-yet-shown badges.
    await queryRunner.query(`
      CREATE INDEX "IDX_badge_cooldown_queue_unshown"
      ON "badge_cooldown_queue" ("userId", "releasedAt")
      WHERE "status" = 'released' AND "shownAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_badge_cooldown_queue_unshown"`);
    await queryRunner.query(`
      ALTER TABLE "badge_cooldown_queue" DROP COLUMN "shownAt"
    `);
  }
}
