import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One row per Instagram post: what the post *is* (caption, image, link, kind,
 * when it was published) and its latest numbers.
 *
 * `instagram_post_metric` keeps the daily history of the numbers; this table is
 * the current state the analytics posts lists read. Keeping identity here
 * rather than on every daily reading means a caption is stored once, not once
 * a day, and the lists read at most a few rows through an index instead of
 * de-duplicating a user's whole history on every request.
 *
 * `thumbnailUrl` is Meta's CDN link, not a copy, and those links expire. The
 * daily pull reads the newest 25 posts, so only those have their link (and
 * numbers) refreshed; an older post keeps its last ones, and the UI falls back
 * to a placeholder once its image stops loading.
 */
export class InstagramPosts1785150000000 implements MigrationInterface {
  name = "InstagramPosts1785150000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "instagram_post" (
        "userId" text NOT NULL,
        "mediaId" text NOT NULL,
        "mediaType" text,
        "permalink" text,
        "postedAt" TIMESTAMP WITH TIME ZONE,
        "caption" text,
        "thumbnailUrl" text,
        "views" integer,
        "likes" integer,
        "comments" integer,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_instagram_post" PRIMARY KEY ("userId", "mediaId"),
        CONSTRAINT "CHK_instagram_post_nonneg" CHECK (
          COALESCE("views", 0) >= 0 AND COALESCE("likes", 0) >= 0
          AND COALESCE("comments", 0) >= 0
        ),
        CONSTRAINT "FK_instagram_post_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    // The two list reads: newest posts, and most-viewed posts.
    await queryRunner.query(`
      CREATE INDEX "IDX_instagram_post_recent"
      ON "instagram_post" ("userId", "postedAt" DESC NULLS LAST)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_instagram_post_top"
      ON "instagram_post" ("userId", "views" DESC)
      WHERE "views" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "instagram_post"`);
  }
}
