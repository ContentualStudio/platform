import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  type PostHogCapture,
  type PostHogClientProvider,
} from "./posthog-client.provider";
import { PostHogProductAnalytics } from "./product-analytics.service";
import { productEventTokens } from "./product-events";
import { REDACTED } from "./redact";

interface Captured {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  uuid?: string;
}

function analytics(onCapture?: () => void) {
  const captures: Captured[] = [];

  const client: PostHogCapture = {
    capture(input) {
      onCapture?.();
      captures.push(input);
    },
    captureException() {},
    async shutdown() {},
  };

  return {
    captures,
    service: new PostHogProductAnalytics({ client } as PostHogClientProvider),
  };
}

test("captures against the authenticated user", () => {
  const { service, captures } = analytics();

  service.capture({
    identity: { userId: "user-1" },
    event: productEventTokens.onboardingStage2Completed,
    properties: { programmeId: "programme-1" },
  });

  assert.equal(captures.length, 1);
  assert.equal(captures[0].distinctId, "user-1");
  assert.equal(captures[0].event, productEventTokens.onboardingStage2Completed);
  assert.equal(captures[0].properties?.programmeId, "programme-1");
});

// Pre-auth moments have to carry the distinct id the browser already generated,
// or PostHog can never reconcile them with the user who signs up.
test("captures a pre-auth moment against the browser's anonymous id", () => {
  const { service, captures } = analytics();

  service.capture({
    identity: { anonymousId: "anon-abc" },
    event: productEventTokens.loginCodeRequested,
  });

  assert.equal(captures[0].distinctId, "anon-abc");
});

// The uuid is what makes an at-least-once capture path safe: PostHog drops a
// repeat of a uuid it has already ingested.
test("passes a supplied uuid through for deduplication", () => {
  const { service, captures } = analytics();

  service.capture({
    identity: { userId: "user-1" },
    event: productEventTokens.badgeEarned,
    uuid: "event-1",
  });

  assert.equal(captures[0].uuid, "event-1");
});

test("omits the uuid when the caller has no stable key", () => {
  const { service, captures } = analytics();

  service.capture({
    identity: { userId: "user-1" },
    event: productEventTokens.userSignedIn,
  });

  assert.ok(!("uuid" in captures[0]));
});

// Enforced here rather than trusted to call sites, so it holds for call sites
// that do not exist yet.
test("redacts properties before they reach PostHog", () => {
  const { service, captures } = analytics();

  service.capture({
    identity: { userId: "user-1" },
    event: productEventTokens.loginCodeRequested,
    properties: { code: "123456", intent: "signup" },
  });

  assert.equal(captures[0].properties?.code, REDACTED);
  assert.equal(captures[0].properties?.intent, "signup");
});

test("an absent client captures nothing and does not throw", () => {
  const service = new PostHogProductAnalytics({
    client: null,
  } as PostHogClientProvider);

  assert.doesNotThrow(() =>
    service.capture({
      identity: { userId: "user-1" },
      event: productEventTokens.userSignedUp,
    }),
  );
});

// A throwing capture on a product path would turn a PostHog outage into an
// outage of whatever it was observing.
test("a throwing client is swallowed rather than propagated", () => {
  const { service } = analytics(() => {
    throw new Error("posthog unreachable");
  });

  assert.doesNotThrow(() =>
    service.capture({
      identity: { userId: "user-1" },
      event: productEventTokens.userSignedUp,
    }),
  );
});
