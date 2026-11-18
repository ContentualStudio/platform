import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  isExpired,
  isPermissionStale,
  isRefreshEligible,
  permissionStaleAfterMs,
  refreshEligibleAfterMs,
  resolveStatus,
  type TokenTimestamps,
} from "./token-lifecycle";

const now = new Date("2026-08-25T09:00:00.000Z");

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

function token(overrides: Partial<TokenTimestamps> = {}): TokenTimestamps {
  return {
    issuedAt: ago(refreshEligibleAfterMs),
    expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60_000),
    lastRefreshedAt: null,
    lastUsedAt: null,
    ...overrides,
  };
}

test("a token younger than a day is not refresh eligible", () => {
  assert.equal(
    isRefreshEligible(token({ issuedAt: ago(refreshEligibleAfterMs - 1) }), now),
    false,
  );
});

// The boundary is inclusive: Meta accepts a refresh at 24 hours, and excluding
// it would push every daily pull an hour later each day.
test("a token exactly a day old is refresh eligible", () => {
  assert.equal(isRefreshEligible(token(), now), true);
});

test("age counts from the last refresh, not from issue", () => {
  const refreshed = token({
    issuedAt: ago(30 * 24 * 60 * 60_000),
    lastRefreshedAt: ago(60_000),
  });

  assert.equal(isRefreshEligible(refreshed, now), false);
});

test("expiry is inclusive of the moment it expires", () => {
  assert.equal(isExpired(token({ expiresAt: now }), now), true);
  assert.equal(
    isExpired(token({ expiresAt: new Date(now.getTime() + 1) }), now),
    false,
  );
});

test("an unused permission's clock starts at issue", () => {
  assert.equal(
    isPermissionStale(token({ issuedAt: ago(permissionStaleAfterMs) }), now),
    true,
  );
  assert.equal(
    isPermissionStale(token({ issuedAt: ago(permissionStaleAfterMs - 1) }), now),
    false,
  );
});

test("using a permission restarts its ninety-day clock", () => {
  const used = token({
    issuedAt: ago(permissionStaleAfterMs * 2),
    lastUsedAt: ago(60_000),
  });

  assert.equal(isPermissionStale(used, now), false);
});

test("status resolves to reconnect_required on expiry or staleness", () => {
  assert.equal(resolveStatus(token(), now), "connected");
  assert.equal(resolveStatus(token({ expiresAt: now }), now), "reconnect_required");
  assert.equal(
    resolveStatus(token({ issuedAt: ago(permissionStaleAfterMs) }), now),
    "reconnect_required",
  );
});

// disconnected is a decision, never an inference: a user who disconnected and a
// user whose token lapsed need different things said to them.
test("status never infers disconnected from a timestamp", () => {
  const dead = token({
    issuedAt: ago(permissionStaleAfterMs * 3),
    expiresAt: ago(1),
  });

  assert.equal(resolveStatus(dead, now), "reconnect_required");
});
