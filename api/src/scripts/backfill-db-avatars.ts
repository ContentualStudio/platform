import "reflect-metadata";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import dataSource from "../database/data-source";

/**
 * Moves avatars that still live in S3 into the database.
 *
 * One-off, for rows written before the avatar store moved to Postgres. It
 * reads each `user_profile.avatarKey`, copies the object into `user_avatar`,
 * repoints `user.image` at the serving endpoint and clears the key. Rerunnable:
 * a row whose object has already been copied is skipped rather than fetched
 * again.
 */

const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function publicUrl(): string {
  return (
    process.env.API_PUBLIC_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

async function main(): Promise<void> {
  await dataSource.initialize();

  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  const bucket = process.env.AWS_S3_BUCKET_NAME;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET_NAME is required to read the old objects");
  }

  const pending: { userId: string; avatarKey: string }[] =
    await dataSource.query(`
      SELECT p."userId", p."avatarKey"
      FROM user_profile p
      LEFT JOIN user_avatar a ON a."userId" = p."userId"
      WHERE p."avatarKey" IS NOT NULL AND a."userId" IS NULL
    `);

  let copied = 0;
  const skipped: string[] = [];

  for (const row of pending) {
    try {
      const object = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: row.avatarKey }),
      );
      const contentType = (object.ContentType ?? "").toLowerCase();

      if (!CONTENT_TYPES.has(contentType) || !object.Body) {
        skipped.push(`${row.userId}: unsupported content type "${contentType}"`);
        continue;
      }

      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const etag = createHash("sha256").update(bytes).digest("hex");

      await dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO user_avatar ("userId", "contentType", "bytes", "byteSize", "etag")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("userId") DO UPDATE
             SET "contentType" = EXCLUDED."contentType",
                 "bytes" = EXCLUDED."bytes",
                 "byteSize" = EXCLUDED."byteSize",
                 "etag" = EXCLUDED."etag",
                 "updatedAt" = now()`,
          [row.userId, contentType, bytes, bytes.byteLength, etag],
        );
        await manager.query(`UPDATE "user" SET "image" = $2 WHERE "id" = $1`, [
          row.userId,
          `${publicUrl()}/profile/me/avatar?v=${etag.slice(0, 16)}`,
        ]);
        await manager.query(
          `UPDATE user_profile SET "avatarKey" = NULL WHERE "userId" = $1`,
          [row.userId],
        );
      });

      copied += 1;
    } catch (error) {
      skipped.push(`${row.userId}: ${String(error)}`);
    }
  }

  console.log(JSON.stringify({ found: pending.length, copied, skipped }, null, 2));
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
