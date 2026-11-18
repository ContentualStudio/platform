import * as assert from "node:assert/strict";
import { test } from "node:test";
import { rateLimitNames, rateLimits } from "./limits";

test("the three named limits match the platform contract", () => {
  assert.deepEqual([...rateLimitNames], [
    "auth",
    "mutation",
    "analyticsRefresh",
  ]);
  assert.deepEqual(rateLimits.auth, {
    limit: 10,
    window: "1 m",
    windowMs: 60_000,
    keyBy: "ip",
  });
  assert.deepEqual(rateLimits.mutation, {
    limit: 60,
    window: "1 m",
    windowMs: 60_000,
    keyBy: "user",
  });
  assert.deepEqual(rateLimits.analyticsRefresh, {
    limit: 1,
    window: "1 h",
    windowMs: 60 * 60_000,
    keyBy: "user",
  });
});
