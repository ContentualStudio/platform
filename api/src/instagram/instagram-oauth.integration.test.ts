import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import type { ConfigService } from "@nestjs/config";
import type { InstagramApiPort } from "./instagram-api.port";
import { InstagramOauthService } from "./instagram-oauth.service";
import type { InstagramTokenService } from "./instagram-token.service";

// Single use and expiry are properties of the SQL, not of the code around it:
// the consume statement is an UPDATE guarded on `consumedAt IS NULL` and
// `expiresAt > now()`, and only a real database can show that two concurrent
// callbacks cannot both redeem the same state.

const USER = "instagram-oauth-user";

let dataSource: DataSource;

const settings: Record<string, unknown> = {
  "instagram.appId": "app-id",
  "instagram.appSecret": "app-secret",
  "instagram.configured": true,
  "instagram.oauthBaseUrl": "https://www.instagram.com",
  "instagram.redirectUri": "https://web.example.com/api-proxy/instagram/oauth/callback",
  "instagram.oauthStateTtlMs": 600_000,
};

function oauthService(overrides: Record<string, unknown> = {}) {
  const config = {
    get: (path: string) => ({ ...settings, ...overrides })[path],
  } as unknown as ConfigService;

  return new InstagramOauthService(
    dataSource,
    config,
    {} as unknown as InstagramTokenService,
    {} as unknown as InstagramApiPort,
  );
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER]);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER, USER, `${USER}@example.test`],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER]);
  await dataSource.destroy();
});

test("a minted state can be consumed exactly once", { skip }, async () => {
  const service = oauthService();
  const { state } = await service.startAuthorization({
    userId: USER,
    dataConsent: true,
  });

  const first = await service.consumeState(state);
  const second = await service.consumeState(state);

  assert.equal(first?.userId, USER);
  assert.equal(first?.dataConsent, true);
  assert.equal(second, null, "a state must not be redeemable twice");
});

// The window the table exists to close: two callbacks arriving together.
test("concurrent callbacks cannot both redeem one state", { skip }, async () => {
  const service = oauthService();
  const { state } = await service.startAuthorization({
    userId: USER,
    dataConsent: true,
  });

  const results = await Promise.all([
    service.consumeState(state),
    service.consumeState(state),
    service.consumeState(state),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
});

test("an expired state is refused", { skip }, async () => {
  const service = oauthService({ "instagram.oauthStateTtlMs": 1 });
  const { state } = await service.startAuthorization({
    userId: USER,
    dataConsent: true,
  });

  await dataSource.query(
    `UPDATE "instagram_oauth_state" SET "expiresAt" = now() - interval '1 second'
      WHERE "state" = $1`,
    [state],
  );

  assert.equal(await service.consumeState(state), null);
});

test("an unknown state is refused rather than throwing", { skip }, async () => {
  assert.equal(await oauthService().consumeState("never-minted"), null);
});

test("consent given before authorising travels on the state row", { skip }, async () => {
  const service = oauthService();
  const { state } = await service.startAuthorization({
    userId: USER,
    dataConsent: false,
    returnPath: "/onboarding",
  });

  const consumed = await service.consumeState(state);

  assert.equal(consumed?.dataConsent, false);
  assert.equal(consumed?.returnPath, "/onboarding");
});

// Each extra scope adds its own screencast to App Review, so the authorize url
// asking for exactly two is a claim worth pinning.
test("the authorize url requests exactly the two read-only scopes", { skip }, async () => {
  const { authorizeUrl } = await oauthService().startAuthorization({
    userId: USER,
    dataConsent: true,
  });

  const url = new URL(authorizeUrl);

  assert.equal(
    url.searchParams.get("scope"),
    "instagram_business_basic,instagram_business_manage_insights",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://web.example.com/api-proxy/instagram/oauth/callback",
  );
  assert.ok(url.searchParams.get("state"));
  // The app secret is never part of a url the browser is sent to.
  assert.ok(!authorizeUrl.includes("app-secret"));
});

test("expired states are purged only after a grace period", { skip }, async () => {
  const service = oauthService();
  const { state } = await service.startAuthorization({
    userId: USER,
    dataConsent: true,
  });

  await dataSource.query(
    `UPDATE "instagram_oauth_state" SET "expiresAt" = now() - interval '1 hour'
      WHERE "state" = $1`,
    [state],
  );
  await service.purgeExpiredStates();

  const recent = (await dataSource.query(
    `SELECT 1 FROM "instagram_oauth_state" WHERE "state" = $1`,
    [state],
  )) as unknown[];

  // Recently expired rows survive, so a user who took too long still gets a
  // clear "that link expired" rather than "unknown state".
  assert.equal(recent.length, 1);

  await dataSource.query(
    `UPDATE "instagram_oauth_state" SET "expiresAt" = now() - interval '2 days'
      WHERE "state" = $1`,
    [state],
  );
  await service.purgeExpiredStates();

  const old = (await dataSource.query(
    `SELECT 1 FROM "instagram_oauth_state" WHERE "state" = $1`,
    [state],
  )) as unknown[];

  assert.equal(old.length, 0);
});
