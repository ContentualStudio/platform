import * as assert from "node:assert/strict";
import { test } from "node:test";
import { InstagramTokenStore1784890000000 } from "./migrations/1784890000000-InstagramTokenStore";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// The credential store is the one place a user's Instagram access token lives,
// so its shape is pinned here: the split table (so no ordinary read of
// platform_connection can load ciphertext), the key id that makes rotation
// possible, and the paired status CHECK that stops a connection being live and
// disconnected at the same time. The real schema is exercised against Postgres
// in instagram/instagram-token.integration.test.ts; this is the cheap check
// that runs with no database.
async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();

  await new InstagramTokenStore1784890000000().up(runner);

  return sql.join("\n");
}

const requiredFragments = [
  // Connection-level, non-secret facts.
  `"accountType" text`,
  `"dataConsent" boolean NOT NULL DEFAULT false`,
  `"consentGrantedAt" TIMESTAMP WITH TIME ZONE`,
  `"status" text NOT NULL DEFAULT 'connected'`,
  `"lastAccountTypeCheckAt" TIMESTAMP WITH TIME ZONE`,
  `CHK_platform_connection_status`,
  `'connected', 'reconnect_required', 'disconnected'`,
  `CHK_platform_connection_account_type`,
  // The secret, in its own table.
  `"platform_connection_credential"`,
  `"connectionId" bigint PRIMARY KEY`,
  `"keyId" text NOT NULL`,
  `"iv" bytea NOT NULL`,
  `"authTag" bytea NOT NULL`,
  `"ciphertext" bytea NOT NULL`,
  `"scopes" text array NOT NULL`,
  `"issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL`,
  `"expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL`,
  `"lastRefreshedAt" TIMESTAMP WITH TIME ZONE`,
  `"lastUsedAt" TIMESTAMP WITH TIME ZONE`,
  `CHK_platform_connection_credential_expiry`,
  `CHK_platform_connection_credential_scopes`,
  `FK_platform_connection_credential_connection`,
  `IDX_platform_connection_credential_user`,
  // Single-use OAuth state.
  `"instagram_oauth_state"`,
  `"state" text PRIMARY KEY`,
  `"consumedAt" TIMESTAMP WITH TIME ZONE`,
  `IDX_instagram_oauth_state_expiry`,
];

test("up creates the credential store, connection state columns, and oauth state", async () => {
  const combined = await migrationSql();

  for (const fragment of requiredFragments) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

// The emit gate is the partial unique index on the existing table. `status` is
// additive; if the two ever disagree the gate and the UI read different truths.
test("status and disconnectedAt are pinned to each other by a check", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `CHECK (("status" = 'disconnected') = ("disconnectedAt" IS NOT NULL))`,
    ),
  );
});

// The CHECK cannot be validated against rows that predate the column, so the
// backfill has to run first.
test("existing disconnected rows are backfilled before the check is added", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new InstagramTokenStore1784890000000().up(runner);

  const backfill = sql.findIndex((statement) =>
    statement.includes(`SET "status" = 'disconnected'`),
  );
  const check = sql.findIndex((statement) =>
    statement.includes("CHK_platform_connection_status_matches_disconnect"),
  );

  assert.ok(backfill >= 0 && check >= 0);
  assert.ok(backfill < check, "backfill must precede the constraint");
});

test("down drops the credential store and the columns it added", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new InstagramTokenStore1784890000000().down(runner);

  const combined = sql.join("\n");

  for (const fragment of [
    `DROP TABLE IF EXISTS "instagram_oauth_state"`,
    `DROP TABLE IF EXISTS "platform_connection_credential"`,
    `DROP COLUMN IF EXISTS "dataConsent"`,
    `DROP COLUMN IF EXISTS "status"`,
  ]) {
    assert.ok(combined.includes(fragment), `down must include ${fragment}`);
  }
});
