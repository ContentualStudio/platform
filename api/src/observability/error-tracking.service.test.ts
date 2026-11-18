import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANONYMOUS_ERROR_DISTINCT_ID,
  PostHogErrorTracking,
} from "./error-tracking.service";
import type {
  PostHogCapture,
  PostHogClientProvider,
} from "./posthog-client.provider";

interface CapturedException {
  error: unknown;
  distinctId?: string;
  properties?: Record<string, unknown>;
}

function tracking(onCapture?: () => void) {
  const captures: CapturedException[] = [];

  const client: PostHogCapture = {
    capture() {},
    captureException(error, distinctId, properties) {
      onCapture?.();
      captures.push({ error, distinctId, properties });
    },
    async shutdown() {},
  };

  return {
    captures,
    service: new PostHogErrorTracking({ client } as PostHogClientProvider),
  };
}

test("captures the failure against the authenticated user", () => {
  const { service, captures } = tracking();
  const failure = new Error("boom");

  service.captureException(failure, {
    operation: "POST /challenge-setup/complete",
    route: "/challenge-setup/complete",
    method: "POST",
    statusCode: 500,
    userId: "user-1",
  });

  assert.equal(captures.length, 1);
  // Not the same object: the exception is scrubbed on the way out, which means
  // a copy. The message and name are what a diagnosis actually reads.
  const captured = captures[0].error as Error;
  assert.equal(captured.message, "boom");
  assert.equal(captured.name, "Error");
  assert.equal(captures[0].distinctId, "user-1");
  assert.equal(captures[0].properties?.operation, "POST /challenge-setup/complete");
  assert.equal(captures[0].properties?.statusCode, 500);
});

// An unattributed failure still has to be findable rather than scattered across
// invented ids that resolve to no person.
test("an unauthenticated failure lands on a fixed operational identity", () => {
  const { service, captures } = tracking();

  service.captureException(new Error("boom"), { operation: "GET /health" });

  assert.equal(captures[0].distinctId, ANONYMOUS_ERROR_DISTINCT_ID);
});

// Server-side capture would otherwise be geolocated from the api's own address:
// personal data this product does not need, and misleading besides.
test("suppresses geoip resolution", () => {
  const { service, captures } = tracking();

  service.captureException(new Error("boom"), { operation: "GET /health" });

  assert.equal(captures[0].properties?.$ip, null);
});

test("a throwing client is swallowed rather than propagated", () => {
  const { service } = tracking(() => {
    throw new Error("posthog unreachable");
  });

  assert.doesNotThrow(() =>
    service.captureException(new Error("boom"), { operation: "GET /health" }),
  );
});

test("an absent client captures nothing and does not throw", () => {
  const service = new PostHogErrorTracking({
    client: null,
  } as PostHogClientProvider);

  assert.doesNotThrow(() =>
    service.captureException(new Error("boom"), { operation: "GET /health" }),
  );
});

// The context bag was always structurally safe — it is a fixed, narrow shape.
// The exception itself was not: a failed Graph call puts the request url, and
// any token that leaked into it, straight into the error it throws.
test("a token inside the exception never reaches the capture", () => {
  const { service, captures } = tracking();
  const token = "IGQVJYaGxsdGVzdHRva2VuZm9yc2NydWJiaW5n";

  service.captureException(new Error(`exchange failed: access_token=${token}`), {
    operation: "InstagramTokenService.refresh",
    userId: "user-1",
  });

  const captured = captures[0].error as Error;

  assert.ok(!captured.message.includes(token));
  assert.ok(!String(captured.stack ?? "").includes(token));
});
