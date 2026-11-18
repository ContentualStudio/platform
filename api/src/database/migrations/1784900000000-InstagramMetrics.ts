import { MigrationInterface, QueryRunner } from "typeorm";

// The metrics the daily pull writes, beyond the follower count that
// `follower_snapshot` already holds.
//
// Both tables are one row per user per local day, upserted — the same shape
// `follower_snapshot` uses, and for the same reason. Meta revises insight
// numbers for up to 48 hours, so a second reading on the same day is a
// *correction* of the first, not a second fact. Storing both would put a
// saw-tooth in every graph drawn from them.
//
// (The Instagram Integration ticket asks for append-only rows. This is the
// conscious deviation: `pulledAt` records when the authoritative reading was
// taken, which is the property the ticket actually needs, and one reading per
// day is what the growth surfaces consume. `follower_snapshot` needs no such
// column — its upsert already moves `recordedAt` to now().)
//
// Every metric column is nullable, because absence is a normal outcome rather
// than a failure: a personal account serves no insights at all, an account
// under 100 followers is refused the gated ones, and Meta simply omits metrics
// that do not apply to a media type. A missing metric must stay missing — a
// zero would read as "nobody saw this", which is a different claim.
export class InstagramMetrics1784900000000 implements MigrationInterface {
  name = "InstagramMetrics1784900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "instagram_account_metric" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "localDate" date NOT NULL,
        "followerCount" integer NOT NULL,
        "reach" integer,
        "totalInteractions" integer,
        "profileLinksTaps" integer,
        -- False when the account could not serve insights at all (personal, or
        -- below the follower gate). Distinguishes "we asked and got nothing"
        -- from "we have not asked yet".
        "metricsAvailable" boolean NOT NULL DEFAULT true,
        "pulledAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_instagram_account_metric_nonneg" CHECK (
          "followerCount" >= 0
          AND COALESCE("reach", 0) >= 0
          AND COALESCE("totalInteractions", 0) >= 0
          AND COALESCE("profileLinksTaps", 0) >= 0
        ),
        CONSTRAINT "FK_instagram_account_metric_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instagram_account_metric_day"
      ON "instagram_account_metric" ("userId", "localDate")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "instagram_post_metric" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "mediaId" text NOT NULL,
        -- The day the reading was taken, not the day the post was published.
        "localDate" date NOT NULL,
        "mediaType" text,
        "permalink" text,
        "postedAt" TIMESTAMP WITH TIME ZONE,
        "views" integer,
        "reach" integer,
        "likes" integer,
        "comments" integer,
        "shares" integer,
        "saved" integer,
        "pulledAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_instagram_post_metric_nonneg" CHECK (
          COALESCE("views", 0) >= 0 AND COALESCE("reach", 0) >= 0
          AND COALESCE("likes", 0) >= 0 AND COALESCE("comments", 0) >= 0
          AND COALESCE("shares", 0) >= 0 AND COALESCE("saved", 0) >= 0
        ),
        CONSTRAINT "FK_instagram_post_metric_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // One authoritative reading per post per day, matching the account table.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instagram_post_metric_day"
      ON "instagram_post_metric" ("userId", "mediaId", "localDate")
    `);

    // The top-posts and recent-posts reads: this user's latest day, newest
    // posts first.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_post_metric_recent"
      ON "instagram_post_metric" ("userId", "localDate" DESC, "postedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "instagram_post_metric"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "instagram_account_metric"`);
  }
}
