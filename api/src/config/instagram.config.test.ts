import * as assert from "node:assert/strict";
import { test } from "node:test";
import instagramConfig from "./instagram.config";

const originalEnv = { ...process.env };
const validKey = Buffer.alloc(32, 7).toString("base64");

function clearInstagramEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INSTAGRAM_") || key.startsWith("DAILY_LOCAL_SWEEP_")) {
      delete process.env[key];
    }
  }
}

test.beforeEach(() => {
  clearInstagramEnv();
});

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("config is unconfigured when no meta app is provisioned", () => {
  const config = instagramConfig().instagram;

  assert.equal(config.configured, false);
  assert.equal(config.appId, undefined);
  assert.equal(config.tokenKey, undefined);
});

test("config is configured only when app id, secret and key are all present", () => {
  process.env.INSTAGRAM_APP_ID = "app-id";
  process.env.INSTAGRAM_APP_SECRET = "app-secret";

  assert.equal(instagramConfig().instagram.configured, false);

  process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = validKey;

  assert.equal(instagramConfig().instagram.configured, true);
});

test("a key that is not exactly 32 bytes is rejected rather than half-enabling", () => {
  process.env.INSTAGRAM_APP_ID = "app-id";
  process.env.INSTAGRAM_APP_SECRET = "app-secret";
  process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(31).toString("base64");

  const config = instagramConfig().instagram;

  assert.equal(config.tokenKey, undefined);
  assert.equal(config.configured, false);
});

// The redirect uri has to follow the api's public url through the /api-proxy
// prefix, not the web origin — the same reasoning auth.config.ts documents for
// the Google callback.
test("redirect uri is built off the api public url, including a proxy prefix", () => {
  process.env.API_PUBLIC_URL = "https://web.example.com/api-proxy/";
  process.env.WEB_ORIGIN = "https://web.example.com";

  assert.equal(
    instagramConfig().instagram.redirectUri,
    "https://web.example.com/api-proxy/instagram/oauth/callback",
  );
});

test("redirect uri falls back to the better-auth url locally", () => {
  delete process.env.API_PUBLIC_URL;
  process.env.BETTER_AUTH_URL = "http://localhost:3001";

  assert.equal(
    instagramConfig().instagram.redirectUri,
    "http://localhost:3001/instagram/oauth/callback",
  );
});

test("daily pull is off unless explicitly enabled", () => {
  assert.equal(instagramConfig().scheduling.enabled, false);

  process.env.DAILY_LOCAL_SWEEP_ENABLED = "true";

  assert.equal(instagramConfig().scheduling.enabled, true);
});

test("the sweep hour accepts midnight and rejects nonsense", () => {
  assert.equal(instagramConfig().scheduling.localHour, 7);

  process.env.DAILY_LOCAL_SWEEP_HOUR = "0";
  assert.equal(instagramConfig().scheduling.localHour, 0);

  process.env.DAILY_LOCAL_SWEEP_HOUR = "23";
  assert.equal(instagramConfig().scheduling.localHour, 23);

  for (const bad of ["24", "-1", "seven", ""]) {
    process.env.DAILY_LOCAL_SWEEP_HOUR = bad;
    assert.equal(instagramConfig().scheduling.localHour, 7, `rejected: ${bad}`);
  }
});
