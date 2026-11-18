import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import type { ConfigService } from "@nestjs/config";
import { apiSuccess, type InstagramApiPort } from "./instagram-api.port";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { InstagramTokenService } from "./instagram-token.service";
import { MetaDeauthorizeService } from "./meta-deauthorize.service";
import { signRequestForTest } from "./meta-signed-request";

// The platform-initiated deauthorize path against the real schema. What has to
// hold: an unverified request changes nothing, a verified one destroys the
// credential, and the connection row survives so the next reconnection keeps
// its ordinal.

const USER = "meta-deauth-user";
const ACCOUNT = "ig-meta-deauth";
const APP_SECRET = "app-secret";
const key = Buffer.alloc(32, 19);

let dataSource: DataSource;

function services() {
  const config = {
    get: (path: string) =>
      ({
        "instagram.appSecret": APP_SECRET,
        "instagram.tokenKey": key,
        "instagram.tokenKeyId": "v1",
        "auth.webOrigin": "https://app.example.com",
      })[path],
  } as unknown as ConfigService;

  const tokens = new InstagramTokenService(dataSource, config);
  const purge = new InstagramDataPurgeService(dataSource, tokens, {
    revoke: async () => apiSuccess(undefined),
  } as unknown as InstagramApiPort);

  return {
    deauthorize: new MetaDeauthorizeService(dataSource, config, purge),
    tokens,
  };
}

function signed(overrides: Record<string, unknown> = {}): string {
  return signRequestForTest(
    {
      user_id: ACCOUNT,
      algorithm: "HMAC-SHA256",
      issued_at: Math.floor(Date.now() / 1000),
      ...overrides,
    },
    APP_SECRET,
  );
}

async function seed() {
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER, USER, `${USER}@example.test`],
  );
  const connection = (await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "status")
     VALUES ($1, 'instagram', $2, 'creator', 1, 'professional', true, 'connected')
     RETURNING "id"`,
    [USER, ACCOUNT],
  )) as { id: string }[];
  await services().tokens.storeToken({
    userId: USER,
    connectionId: connection[0].id,
    accessToken: "long-lived-token",
    expiresInSeconds: 60 * 24 * 60 * 60,
    scopes: ["instagram_business_basic"],
  });
  await dataSource.query(
    `INSERT INTO "follower_snapshot" ("userId", "platform", "localDate", "followerCount")
     VALUES ($1, 'instagram', CURRENT_DATE, 500)`,
    [USER],
  );
}

async function count(table: string): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT COUNT(*)::int AS "count" FROM "${table}" WHERE "userId" = $1`,
    [USER],
  )) as { count: number }[];

  return rows[0].count;
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

async function clean() {
  for (const table of [
    "platform_connection_credential",
    "follower_snapshot",
    "platform_connection",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER]);
}

beforeEach(async () => {
  if (skip) {
    return;
  }

  await clean();
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await clean();
  await dataSource.destroy();
});

test("a verified deauthorize destroys the stored credential", { skip }, async () => {
  await seed();
  const { deauthorize } = services();

  const outcome = await deauthorize.handleSignedRequest(signed());

  assert.deepEqual(outcome, { ok: true, matched: true });
  assert.equal(await count("platform_connection_credential"), 0);
});

test("the connection row survives so the next connect keeps its ordinal", { skip }, async () => {
  await seed();
  const { deauthorize } = services();

  await deauthorize.handleSignedRequest(signed());

  const rows = (await dataSource.query(
    `SELECT "status", "connectionOrdinal" FROM "platform_connection" WHERE "userId" = $1`,
    [USER],
  )) as { status: string; connectionOrdinal: number }[];

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "disconnected");
  assert.equal(rows[0].connectionOrdinal, 1);
});

test("an unverified request changes nothing", { skip }, async () => {
  await seed();
  const { deauthorize } = services();

  const outcome = await deauthorize.handleSignedRequest(
    signRequestForTest({ user_id: ACCOUNT }, "the-wrong-secret"),
  );

  assert.deepEqual(outcome, { ok: false, reason: "bad_signature" });
  assert.equal(await count("platform_connection_credential"), 1);
  assert.equal(await count("platform_connection"), 1);
});

test("an account we do not hold is a success, not an error", { skip }, async () => {
  const { deauthorize } = services();

  const outcome = await deauthorize.handleSignedRequest(
    signed({ user_id: "ig-nobody" }),
  );

  assert.deepEqual(outcome, { ok: true, matched: false });
});
