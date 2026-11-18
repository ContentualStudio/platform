import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Avatar bytes move into Postgres.
 *
 * They previously went to S3 and were served from a URL on `user.image`, which
 * only worked where a bucket and a public CDN in front of it were configured —
 * anywhere else the browser got a 403 and the UI silently fell back to
 * initials. Storing them here removes that configuration from the path a
 * signup depends on.
 *
 * `avatarKey` on `user_profile` is deliberately left in place. It still points
 * at objects that exist in the bucket, and deleting the column in the same
 * change that stops writing it would strand those objects with nothing left to
 * name them. Removing it belongs to a cleanup migration, after a backfill.
 */
export class UserAvatarStore1785010000000 implements MigrationInterface {
  name = "UserAvatarStore1785010000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_avatar" (
        "userId" text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
        "contentType" text NOT NULL,
        "bytes" bytea NOT NULL,
        "byteSize" integer NOT NULL,
        "etag" text NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "CHK_user_avatar_content_type"
          CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT "CHK_user_avatar_size" CHECK ("byteSize" > 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_avatar"`);
  }
}
