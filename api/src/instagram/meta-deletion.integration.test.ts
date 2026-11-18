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
import { MetaDeletionService } from "./meta-deletion.service";
import { signRequestForTest } from "./meta-signed-request";

// The platform-initiated deletion path, end to end against the real schema.
// What matters here is that an unverified request changes nothing, that a
// verified one erases the same set the in-app disconnect does, and that Meta
// always gets a usable confirmation back.

const USER = "meta-deletion-user";
const ACCOUNT = "ig-meta-deletion";
const APP_SECRET = "app-secret";
const key = Buffer.alloc(32, 17);

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

  return { deletion: new MetaDeletionService(dataSource, config, purge) };
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
  await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "status")
     VALUES ($1, 'instagram', $2, 'creator', 1, 'professional', true, 'connected')`,
    [USER, ACCOUNT],
  );
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
  await dataSource.query(
    `DELETE FROM "meta_deletion_request" WHERE "externalAccountId" = $1`,
    [ACCOUNT],
  );
  for (const table of ["follower_snapshot", "platform_connection"]) {
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

test("a verified request erases the account's data", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const outcome = await deletion.handleSignedRequest(signed());

  assert.ok(outcome.ok);
  assert.equal(await count("platform_connection"), 0);
  assert.equal(await count("follower_snapshot"), 0);
});

test("the confirmation carries a lookup url and a code, and nothing else", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const outcome = await deletion.handleSignedRequest(signed());

  assert.ok(outcome.ok);
  assert.deepEqual(Object.keys(outcome).sort(), ["confirmationCode", "ok", "url"]);
  assert.ok(outcome.url.startsWith("https://app.example.com/legal/data-deletion?code="));
  assert.ok(outcome.url.includes(outcome.confirmationCode));
});

// An unverified request is not a request. Nothing is deleted and nothing is
// recorded, so a forged call cannot even enumerate accounts by side effect.
test("a forged request deletes nothing and records nothing", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const forged = signRequestForTest(
    { user_id: ACCOUNT, algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000) },
    "not-our-secret",
  );

  const outcome = await deletion.handleSignedRequest(forged);

  assert.ok(!outcome.ok);
  assert.equal(await count("platform_connection"), 1);
  assert.equal(await count("follower_snapshot"), 1);

  const recorded = (await dataSource.query(
    `SELECT 1 FROM "meta_deletion_request" WHERE "externalAccountId" = $1`,
    [ACCOUNT],
  )) as unknown[];

  assert.equal(recorded.length, 0);
});

// Nothing to delete is a successful outcome: Meta still needs its code.
test("a request for an unknown account still gets a confirmation", { skip }, async () => {
  const { deletion } = services();

  const outcome = await deletion.handleSignedRequest(signed({ user_id: "ig-nobody" }));

  assert.ok(outcome.ok);

  const status = await deletion.findStatus(outcome.confirmationCode);

  assert.equal(status?.status, "no_match");
  assert.ok(status?.completedAt);

  await dataSource.query(
    `DELETE FROM "meta_deletion_request" WHERE "externalAccountId" = $1`,
    ["ig-nobody"],
  );
});

// A resent callback must not mint a second code: the user would be holding two
// confirmations for one request and neither would look authoritative.
test("a repeated callback returns the same confirmation code", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const first = await deletion.handleSignedRequest(signed());
  const second = await deletion.handleSignedRequest(signed());

  assert.ok(first.ok && second.ok);
  assert.equal(first.confirmationCode, second.confirmationCode);

  const rows = (await dataSource.query(
    `SELECT COUNT(*)::int AS "count" FROM "meta_deletion_request"
      WHERE "externalAccountId" = $1`,
    [ACCOUNT],
  )) as { count: number }[];

  assert.equal(rows[0].count, 1);
});

test("a completed deletion is reportable by its code", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const outcome = await deletion.handleSignedRequest(signed());

  assert.ok(outcome.ok);

  const status = await deletion.findStatus(outcome.confirmationCode);

  assert.equal(status?.status, "completed");
  assert.ok(status?.completedAt);
});

test("an unknown confirmation code reports nothing rather than throwing", { skip }, async () => {
  assert.equal(
    await services().deletion.findStatus("00000000-0000-0000-0000-000000000000"),
    null,
  );
});

// The record has to outlive the data it erased, or it cannot answer the one
// question it exists to answer.
test("the deletion record survives the erasure it describes", { skip }, async () => {
  await seed();
  const { deletion } = services();

  const outcome = await deletion.handleSignedRequest(signed());

  assert.ok(outcome.ok);
  assert.equal(await count("platform_connection"), 0);
  assert.ok(await deletion.findStatus(outcome.confirmationCode));
});
