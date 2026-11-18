import { MigrationInterface, QueryRunner } from "typeorm";

// The credential store the whole Instagram integration builds on.
//
// The access token lives in its own 1:1 table rather than in a column on
// `platform_connection`. Three reasons, in order of weight:
//   1. `platform_connection` is read by code that has no business seeing a
//      token — the analytics snapshot reads it on every dashboard load. A
//      separate table means no ordinary read can accidentally load ciphertext.
//   2. It gives the token service the only queries that touch the secret, which
//      is what makes "the token service is the sole reader" enforceable rather
//      than merely intended.
//   3. Disconnect has to destroy the token while keeping the connection row —
//      the row mints `connectionOrdinal`, and dropping it would let a later
//      reconnect replay a `platform.connected` stable id that was already used.
//      With the split that is one DELETE, not a nullable-column dance.
//
// `status` is added alongside the existing `disconnectedAt` rather than
// replacing it: the partial unique index on (userId, platform) WHERE
// "disconnectedAt" IS NULL is the platform.connected emit gate and is
// load-bearing. A paired CHECK keeps the two representations from ever
// disagreeing — `reconnect_required` is a substate of a live connection.
export class InstagramTokenStore1784890000000 implements MigrationInterface {
  name = "InstagramTokenStore1784890000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_connection"
        ADD COLUMN IF NOT EXISTS "accountType" text,
        ADD COLUMN IF NOT EXISTS "dataConsent" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "consentGrantedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'connected',
        ADD COLUMN IF NOT EXISTS "lastAccountTypeCheckAt" TIMESTAMP WITH TIME ZONE
    `);

    // Existing rows predate the column and must agree with the CHECK below
    // before it is added, or the constraint cannot be validated.
    await queryRunner.query(`
      UPDATE "platform_connection"
         SET "status" = 'disconnected'
       WHERE "disconnectedAt" IS NOT NULL AND "status" <> 'disconnected'
    `);

    await queryRunner.query(`
      ALTER TABLE "platform_connection"
        ADD CONSTRAINT "CHK_platform_connection_status"
          CHECK ("status" IN ('connected', 'reconnect_required', 'disconnected'))
    `);
    // Unknown is a real state: a connection exists before its first account
    // read resolves, so NULL is allowed and means "not established yet".
    await queryRunner.query(`
      ALTER TABLE "platform_connection"
        ADD CONSTRAINT "CHK_platform_connection_account_type"
          CHECK ("accountType" IS NULL OR "accountType" IN ('professional', 'personal'))
    `);
    // The two status representations are one fact. Any writer that sets one
    // without the other is a bug, and this is what turns that bug into a failed
    // statement instead of a connection that is live and disconnected at once.
    await queryRunner.query(`
      ALTER TABLE "platform_connection"
        ADD CONSTRAINT "CHK_platform_connection_status_matches_disconnect"
          CHECK (("status" = 'disconnected') = ("disconnectedAt" IS NOT NULL))
    `);

    // Keyed by connection, not by user: a user's disconnected connections stay
    // for the ordinal, and only the live one may hold a credential.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_connection_credential" (
        "connectionId" bigint PRIMARY KEY,
        "userId" text NOT NULL,
        -- Which encryption key sealed these bytes. Stored per row so rotating
        -- the key adds a key rather than orphaning every stored token.
        "keyId" text NOT NULL,
        "iv" bytea NOT NULL,
        "authTag" bytea NOT NULL,
        "ciphertext" bytea NOT NULL,
        "scopes" text array NOT NULL,
        "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "lastRefreshedAt" TIMESTAMP WITH TIME ZONE,
        -- Drives the 90-day unused-permission rule, which Meta enforces and we
        -- surface as reconnect_required before it bites the user.
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_platform_connection_credential_expiry"
          CHECK ("expiresAt" > "issuedAt"),
        CONSTRAINT "CHK_platform_connection_credential_scopes"
          CHECK (cardinality("scopes") > 0),
        CONSTRAINT "FK_platform_connection_credential_connection"
          FOREIGN KEY ("connectionId") REFERENCES "platform_connection"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_platform_connection_credential_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Every credential query is scoped to the authenticated user, so the read
    // path is (userId) — never the primary key alone.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_platform_connection_credential_user"
      ON "platform_connection_credential" ("userId")
    `);

    // OAuth state needs storage, not just a signature: single-use is a property
    // of a row being consumed, and no self-contained signed token can enforce
    // it. The row also carries the consent the user gave before authorising, so
    // the callback can record consent that was granted before any connection
    // row existed to hold it.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "instagram_oauth_state" (
        "state" text PRIMARY KEY,
        "userId" text NOT NULL,
        "dataConsent" boolean NOT NULL DEFAULT false,
        "returnPath" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "FK_instagram_oauth_state_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Serves the expiry sweep that clears abandoned authorisations.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_oauth_state_expiry"
      ON "instagram_oauth_state" ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "instagram_oauth_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_connection_credential"`);

    for (const constraint of [
      "CHK_platform_connection_status_matches_disconnect",
      "CHK_platform_connection_account_type",
      "CHK_platform_connection_status",
    ]) {
      await queryRunner.query(`
        ALTER TABLE "platform_connection" DROP CONSTRAINT IF EXISTS "${constraint}"
      `);
    }

    await queryRunner.query(`
      ALTER TABLE "platform_connection"
        DROP COLUMN IF EXISTS "lastAccountTypeCheckAt",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "consentGrantedAt",
        DROP COLUMN IF EXISTS "dataConsent",
        DROP COLUMN IF EXISTS "accountType"
    `);
  }
}
