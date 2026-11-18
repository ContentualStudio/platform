import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Account views and profile views, per day.
 *
 * The analytics snapshot was designed around impressions and profile visits.
 * Meta retired `impressions` in Graph API v22 and `views` replaced it;
 * `profile_views` is still served. Both were simply not requested, so the
 * snapshot tiles had nothing real to show. Nullable like the other insights:
 * null is "Instagram did not report it", never zero.
 */
export class InstagramAccountViews1785200000000 implements MigrationInterface {
  name = "InstagramAccountViews1785200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_account_metric"
        ADD COLUMN "views" integer,
        ADD COLUMN "profileViews" integer,
        ADD CONSTRAINT "CHK_instagram_account_metric_views_nonneg"
          CHECK (COALESCE("views", 0) >= 0 AND COALESCE("profileViews", 0) >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instagram_account_metric"
        DROP CONSTRAINT IF EXISTS "CHK_instagram_account_metric_views_nonneg",
        DROP COLUMN IF EXISTS "profileViews",
        DROP COLUMN IF EXISTS "views"
    `);
  }
}
