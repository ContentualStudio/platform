import { MigrationInterface, QueryRunner } from "typeorm";

// `platform_connection` is the platform.connected emit gate:
// (userId, platform, connectionOrdinal) is unique so every connect/reconnect
// is a distinct, addressable row, and the partial unique index on
// (userId, platform) WHERE "disconnectedAt" IS NULL enforces at most one live
// connection per platform without blocking a later reconnect.
//
// `follower_snapshot` is one authoritative reading per user/platform/day — a
// re-sync the same day overwrites it rather than accumulating history.
//
// `follower_milestone`'s unique key is (userId, tier), not
// (userId, platform, tier): the vocabulary's follower.milestone payload has
// no platform field, so a user crossing 100 followers on two platforms must
// emit one event, not two. `platform` here is an audit column only.
export class PlatformConnections1784730000000 implements MigrationInterface {
  name = "PlatformConnections1784730000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_connection" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "platform" text NOT NULL,
        "externalAccountId" text NOT NULL,
        "username" text NOT NULL,
        -- Discriminator in the platform.connected stable ID: distinguishes a
        -- reconnect from the connection it replaced.
        "connectionOrdinal" integer NOT NULL,
        "connectedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "disconnectedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_platform_connection_ordinal" CHECK ("connectionOrdinal" > 0),
        CONSTRAINT "FK_platform_connection_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_platform_connection_ordinal"
      ON "platform_connection" ("userId", "platform", "connectionOrdinal")
    `);
    // At most one live connection per user/platform; a disconnected row does
    // not block a reconnect. This partial index is the platform.connected
    // emit gate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_platform_connection_active"
      ON "platform_connection" ("userId", "platform")
      WHERE "disconnectedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "follower_snapshot" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "platform" text NOT NULL,
        "localDate" date NOT NULL,
        "followerCount" integer NOT NULL,
        "recordedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_follower_snapshot_count" CHECK ("followerCount" >= 0),
        CONSTRAINT "FK_follower_snapshot_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_follower_snapshot_day"
      ON "follower_snapshot" ("userId", "platform", "localDate")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "follower_milestone" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        -- Audit only — deliberately not part of the unique key. See header.
        "platform" text NOT NULL,
        "tier" integer NOT NULL,
        "followerCount" integer NOT NULL,
        "reachedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_follower_milestone_tier" CHECK ("tier" IN (100, 1000, 10000)),
        CONSTRAINT "FK_follower_milestone_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The follower.milestone emit gate: a tier is crossed once per user,
    // permanently.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_follower_milestone_user_tier"
      ON "follower_milestone" ("userId", "tier")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "follower_milestone"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "follower_snapshot"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_connection"`);
  }
}
