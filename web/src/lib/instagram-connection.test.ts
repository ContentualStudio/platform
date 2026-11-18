import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeCallbackError,
  instagramConnectionResponseSchema,
  readCallbackResult,
  toInstagramConnectionState,
  type InstagramConnectionResponse,
} from "./instagram-connection";

function response(
  overrides: Partial<InstagramConnectionResponse> = {},
): InstagramConnectionResponse {
  return {
    connected: true,
    available: true,
    connection: {
      username: "creator",
      accountType: "professional",
      status: "connected",
      dataConsent: true,
      connectedAt: "2026-08-01T00:00:00.000Z",
      scopes: ["instagram_business_basic"],
    },
    ...overrides,
  };
}

test("a connected professional account reads as connected", () => {
  assert.equal(toInstagramConnectionState(response()).kind, "connected");
});

test("no connection reads as disconnected when the integration is available", () => {
  assert.equal(
    toInstagramConnectionState(
      response({ connected: false, connection: null }),
    ).kind,
    "disconnected",
  );
});

// Offering a connect button that cannot work is worse than not offering one.
test("no meta app reads as unavailable rather than disconnected", () => {
  assert.equal(
    toInstagramConnectionState(
      response({ connected: false, connection: null, available: false }),
    ).kind,
    "unavailable",
  );
});

test("a personal account is asked to convert", () => {
  assert.equal(
    toInstagramConnectionState(
      response({ connection: { ...response().connection!, accountType: "personal" } }),
    ).kind,
    "needs-professional",
  );
});

// The personal account is the cause of the reconnect flag, so asking the user
// to reauthorise instead would send them round a loop that cannot fix it.
test("a personal account takes precedence over the reconnect flag", () => {
  assert.equal(
    toInstagramConnectionState(
      response({
        connection: {
          ...response().connection!,
          accountType: "personal",
          status: "reconnect_required",
        },
      }),
    ).kind,
    "needs-professional",
  );
});

test("a lapsed token on a professional account asks for a reconnect", () => {
  assert.equal(
    toInstagramConnectionState(
      response({
        connection: { ...response().connection!, status: "reconnect_required" },
      }),
    ).kind,
    "needs-reconnect",
  );
});

// Strict parsing: a token appearing in this payload should fail loudly here
// rather than quietly reach a browser.
test("an unexpected field is rejected rather than passed through", () => {
  assert.throws(() =>
    instagramConnectionResponseSchema.parse({
      ...response(),
      accessToken: "IGQVJsomething",
    }),
  );
});

test("a successful callback is read from the query string", () => {
  const result = readCallbackResult(
    new URLSearchParams("instagram=connected&username=creator"),
  );

  assert.equal(result.kind, "connected");
  assert.equal(result.kind === "connected" && result.username, "creator");
});

test("a sub-hundred-follower account is noted, not blocked", () => {
  const result = readCallbackResult(
    new URLSearchParams("instagram=connected&username=creator&limited=followers"),
  );

  assert.equal(result.kind === "connected" && result.limitedFollowers, true);
});

test("a personal account comes back as its own outcome", () => {
  const result = readCallbackResult(
    new URLSearchParams("instagram=connected&accountType=personal&username=creator"),
  );

  assert.equal(result.kind, "personal");
});

test("an error callback carries its reason", () => {
  const result = readCallbackResult(new URLSearchParams("instagram=error&reason=cancelled"));

  assert.equal(result.kind, "error");
  assert.equal(result.kind === "error" && result.reason, "cancelled");
});

test("an ordinary page load reads as no result", () => {
  assert.equal(readCallbackResult(new URLSearchParams("")).kind, "none");
  assert.equal(readCallbackResult({}).kind, "none");
});

// Every failure is recoverable, so every message has to say so.
test("each failure reason gets a message that offers a way forward", () => {
  for (const reason of [
    "cancelled",
    "invalid_state",
    "exchange_failed",
    "account_unreadable",
    "something-new",
  ]) {
    const message = describeCallbackError(reason);

    assert.ok(message.length > 0);
    assert.ok(/again/i.test(message), `no way forward offered for ${reason}`);
  }
});
