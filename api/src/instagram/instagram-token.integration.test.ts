import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import type { ConfigService } from "@nestjs/config";
import {
  ConsentRequiredError,
  InstagramTokenService,
  NoLiveConnectionError,
} from "./instagram-token.service";

// What the unit tests cannot prove: that the bytes on disk are ciphertext, that
// the database constraints hold, and that one user's credential is unreachable
// from another user's session. All three are properties of the real schema.

const OWNER = "instagram-token-owner";
const OTHER = "instagram-token-other";
const USERS = [OWNER, OTHER];

const accessToken = "IGQVJrealisticlonglivedaccesstokenvalue";
const key = Buffer.alloc(32, 11);

let dataSource: DataSource;

function tokenService(): InstagramTokenService {
  const config = {
    get: (path: string) =>
      path === "instagram.tokenKey"
        ? key
        : path === "instagram.tokenKeyId"
          ? "v1"
          : undefined,
  } as unknown as ConfigService;

  return new InstagramTokenService(dataSource, config);
}

async function connect(userId: string): Promise<string> {
  const rows = (await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "consentGrantedAt", "status")
     VALUES ($1, 'instagram', $2, $3, 1, 'professional', true, now(), 'connected')
     RETURNING "id"`,
    [userId, `ig-${userId}`, userId],
  )) as { id: string }[];

  return String(rows[0].id);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

async function reset() {
  for (const userId of USERS) {
    await dataSource.query(
      `DELETE FROM "platform_connection" WHERE "userId" = $1`,
      [userId],
    );
    await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [userId]);
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
      [userId, userId, `${userId}@example.test`],
    );
  }
}

beforeEach(async () => {
  if (skip) {
    return;
  }

  await reset();
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  for (const userId of USERS) {
    await dataSource.query(
      `DELETE FROM "platform_connection" WHERE "userId" = $1`,
      [userId],
    );
    await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [userId]);
  }

  await dataSource.destroy();
});

test("a stored token round-trips through the database", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
  });

  const seen = await service.withAccessToken(OWNER, async (token) => token);

  assert.equal(seen, accessToken);
});

// The guarantee the whole ticket exists for.
test("the bytes on disk are not the token", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  const rows = (await dataSource.query(
    `SELECT "ciphertext", "keyId" FROM "platform_connection_credential"
      WHERE "userId" = $1`,
    [OWNER],
  )) as { ciphertext: Buffer; keyId: string }[];

  assert.equal(rows.length, 1);
  assert.ok(!rows[0].ciphertext.toString("utf8").includes(accessToken));
  assert.ok(!rows[0].ciphertext.toString("base64").includes(accessToken));
  // The key id travels with the ciphertext so a rotation can read old rows.
  assert.equal(rows[0].keyId, "v1");
});

test("one user cannot reach another user's token", { skip }, async () => {
  const service = tokenService();
  const ownerConnection = await connect(OWNER);
  await connect(OTHER);

  await service.storeToken({
    userId: OWNER,
    connectionId: ownerConnection,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  await assert.rejects(
    () => service.withAccessToken(OTHER, async () => "should not run"),
    NoLiveConnectionError,
  );

  const connection = await service.getConnection(OTHER);

  assert.equal(connection?.username, OTHER);
});

test("withdrawing consent stops the token being read", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });
  await service.setConsent(OWNER, false);

  await assert.rejects(
    () => service.withAccessToken(OWNER, async () => "should not run"),
    ConsentRequiredError,
  );
});

test("a successful use stamps lastUsedAt", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  const before = await service.getConnection(OWNER);
  assert.equal(before?.lastUsedAt, null);

  await service.withAccessToken(OWNER, async () => "ok");

  const after = await service.getConnection(OWNER);
  assert.ok(after?.lastUsedAt instanceof Date);
});

// Disconnect destroys the credential first, so the rest of the cascade can fail
// and retry without ever leaving a usable token behind.
test("deleting the credential leaves the connection row intact", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  assert.equal(await service.deleteCredential(OWNER), 1);

  const credentials = (await dataSource.query(
    `SELECT 1 FROM "platform_connection_credential" WHERE "userId" = $1`,
    [OWNER],
  )) as unknown[];

  assert.equal(credentials.length, 0);
  // The row survives because it mints connectionOrdinal: dropping it would let
  // a later reconnect replay a platform.connected id that was already used.
  assert.equal((await service.getConnection(OWNER))?.connectionOrdinal, 1);
});

test("dropping the connection cascades its credential away", { skip }, async () => {
  const service = tokenService();
  const connectionId = await connect(OWNER);

  await service.storeToken({
    userId: OWNER,
    connectionId,
    accessToken,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  await dataSource.query(`DELETE FROM "platform_connection" WHERE "id" = $1`, [
    connectionId,
  ]);

  const credentials = (await dataSource.query(
    `SELECT 1 FROM "platform_connection_credential" WHERE "userId" = $1`,
    [OWNER],
  )) as unknown[];

  assert.equal(credentials.length, 0);
});

test("the database refuses a credential with no scopes", { skip }, async () => {
  const connectionId = await connect(OWNER);

  await assert.rejects(
    () =>
      dataSource.query(
        `INSERT INTO "platform_connection_credential"
           ("connectionId", "userId", "keyId", "iv", "authTag", "ciphertext",
            "scopes", "issuedAt", "expiresAt")
         VALUES ($1, $2, 'v1', '\\x00', '\\x00', '\\x00', ARRAY[]::text[], now(), now() + interval '1 day')`,
        [connectionId, OWNER],
      ),
    /CHK_platform_connection_credential_scopes/,
  );
});

test("the database refuses a credential that expires before it is issued", { skip }, async () => {
  const connectionId = await connect(OWNER);

  await assert.rejects(
    () =>
      dataSource.query(
        `INSERT INTO "platform_connection_credential"
           ("connectionId", "userId", "keyId", "iv", "authTag", "ciphertext",
            "scopes", "issuedAt", "expiresAt")
         VALUES ($1, $2, 'v1', '\\x00', '\\x00', '\\x00', ARRAY['a'], now(), now() - interval '1 day')`,
        [connectionId, OWNER],
      ),
    /CHK_platform_connection_credential_expiry/,
  );
});
