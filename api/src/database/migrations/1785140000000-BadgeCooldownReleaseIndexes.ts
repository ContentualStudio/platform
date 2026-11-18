import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The two reads the badge cooldown processor makes on every poll.
 *
 * The existing ("userId", "status", "enqueuedAt") index leads with the user, so
 * "which users have anything queued" could not use it and scanned the whole
 * table — a table that only grows, since released rows are kept. Both indexes
 * are partial, so each stays the size of the rows it actually serves.
 */
export class BadgeCooldownReleaseIndexes1785140000000
  implements MigrationInterface
{
  name = "BadgeCooldownReleaseIndexes1785140000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_badge_cooldown_queue_queued"
      ON "badge_cooldown_queue" ("userId", "enqueuedAt")
      WHERE "status" = 'queued'
    `);
    // The 24-hour check: "has this user had a release since X".
    await queryRunner.query(`
      CREATE INDEX "IDX_badge_cooldown_queue_released"
      ON "badge_cooldown_queue" ("userId", "releasedAt")
      WHERE "status" = 'released'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_badge_cooldown_queue_released"`);
    await queryRunner.query(`DROP INDEX "IDX_badge_cooldown_queue_queued"`);
  }
}
