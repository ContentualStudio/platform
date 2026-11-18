import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ActionFailure, sharedFailureCodes } from "../server/result";
import { setRateLimitBackendForTests } from "./backend";
import { enforceRateLimit } from "./enforce";
import { defaultRateLimitMessage } from "./messages";

afterEach(() => {
  setRateLimitBackendForTests(undefined);
});

test("an allowed caller proceeds without throwing", async () => {
  setRateLimitBackendForTests({
    async limit() {
      return { allowed: true };
    },
  });

  await assert.doesNotReject(() =>
    enforceRateLimit({
      name: "auth",
      operation: "sendEmailCode",
      source: "route",
      headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
    }),
  );
});

test("an over-limit caller is refused with the shared code and message", async () => {
  const resetAt = Date.UTC(2026, 7, 18, 14, 0, 0);
  let seenIdentifier: string | undefined;

  setRateLimitBackendForTests({
    async limit(name, identifier) {
      assert.equal(name, "auth");
      seenIdentifier = identifier;
      return { allowed: false, resetAt };
    },
  });

  await assert.rejects(
    () =>
      enforceRateLimit({
        name: "auth",
        operation: "sendEmailCode",
        source: "route",
        headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
      }),
    (error: unknown) =>
      error instanceof ActionFailure &&
      error.code === sharedFailureCodes.rateLimited &&
      error.message === defaultRateLimitMessage &&
      typeof error.retryAfterMs === "number",
  );

  assert.equal(seenIdentifier, "ip:203.0.113.10");
});

test("a user-keyed limiter uses the authenticated user as the identifier", async () => {
  let seenIdentifier: string | undefined;

  setRateLimitBackendForTests({
    async limit(_name, identifier) {
      seenIdentifier = identifier;
      return { allowed: true };
    },
  });

  await enforceRateLimit({
    name: "mutation",
    operation: "completeStage2",
    source: "action",
    headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
    userId: "user-1",
  });

  assert.equal(seenIdentifier, "user:user-1");
});

test("an analytics-refresh refusal names when the next refresh is allowed", async () => {
  const resetAt = Date.UTC(2026, 7, 18, 15, 30, 0);

  setRateLimitBackendForTests({
    async limit() {
      return { allowed: false, resetAt };
    },
  });

  await assert.rejects(
    () =>
      enforceRateLimit({
        name: "analyticsRefresh",
        operation: "refreshAnalytics",
        source: "action",
        headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
        userId: "user-1",
      }),
    (error: unknown) =>
      error instanceof ActionFailure &&
      error.code === sharedFailureCodes.rateLimited &&
      error.message ===
        `You've already refreshed your analytics. Next refresh is available at ${new Date(resetAt).toISOString()}.`,
  );
});
