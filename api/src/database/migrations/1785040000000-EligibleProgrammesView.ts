import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * When each user last looked at their eligible-programmes list.
 *
 * A programme unlocked after this timestamp carries the newly-unlocked
 * treatment; once the user has seen the list, it stops. One row per user
 * rather than one per unlock: the question the list asks is "what has appeared
 * since you last looked", which is a single watermark, not per-programme state.
 *
 * Absent row means never viewed, which correctly makes every unlock new.
 */
export class EligibleProgrammesView1785040000000 implements MigrationInterface {
  name = "EligibleProgrammesView1785040000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_eligible_programmes_view" (
        "userId" text NOT NULL,
        "lastViewedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_eligible_programmes_view" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_user_eligible_programmes_view_user"
          FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_eligible_programmes_view"`,
    );
  }
}
