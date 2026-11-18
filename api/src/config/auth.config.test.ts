import * as assert from "node:assert/strict";
import { test } from "node:test";
import authConfig from "./auth.config";

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("auth config exposes google oauth settings and web origin", () => {
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

  assert.deepEqual(authConfig().auth.google, {
    clientId: "google-client-id",
    clientSecret: "google-client-secret",
  });
  assert.equal(authConfig().auth.webOrigin, "http://localhost:3000");
});

test("auth base url always spells out the /api/auth mount point", () => {
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  delete process.env.API_PUBLIC_URL;

  assert.equal(authConfig().auth.baseUrl, "http://localhost:3001/api/auth");
  assert.equal(authConfig().auth.publicUrl, "http://localhost:3001");
});

test("auth base url keeps a proxy prefix and appends the mount point", () => {
  process.env.API_PUBLIC_URL = "https://web.example.com/api-proxy/";

  assert.equal(
    authConfig().auth.baseUrl,
    "https://web.example.com/api-proxy/api/auth",
  );
  assert.equal(
    authConfig().auth.publicUrl,
    "https://web.example.com/api-proxy",
  );
});
