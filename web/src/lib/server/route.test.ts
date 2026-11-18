import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { setRateLimitBackendForTests } from "../rate-limit";
import { defaultRateLimitMessage } from "../rate-limit/messages";
import { defineRouteHandler } from "./route";
import { sharedFailureCodes } from "./result";

afterEach(() => {
  setRateLimitBackendForTests(undefined);
});

function jsonRequest(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://contentual.test/api/example", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

test("a successful route answers with its data", async () => {
  const GET = defineRouteHandler({
    name: "health",
    failureMessage: "unused",
    handler: () => ({ ok: true, service: "web" }),
  });

  const response = await GET(new Request("http://contentual.test/api/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "web" });
});

test("an over-limit route is refused before the handler runs", async () => {
  let ran = false;
  setRateLimitBackendForTests({
    async limit() {
      return { allowed: false, resetAt: Date.now() + 30_000 };
    },
  });

  const POST = defineRouteHandler({
    name: "sendEmailCode",
    rateLimit: "auth",
    input: z.object({ email: z.string() }),
    failureMessage: "unused",
    handler: async () => {
      ran = true;
      return { sent: true };
    },
  });

  const response = await POST(jsonRequest({ email: "ada@example.com" }));

  assert.equal(ran, false);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "30");
  assert.deepEqual(await response.json(), {
    code: sharedFailureCodes.rateLimited,
    message: defaultRateLimitMessage,
  });
});

test("an allowed caller reaches the handler", async () => {
  let ran = false;
  setRateLimitBackendForTests({
    async limit() {
      return { allowed: true };
    },
  });

  const POST = defineRouteHandler({
    name: "sendEmailCode",
    rateLimit: "auth",
    input: z.object({ email: z.string() }),
    failureMessage: "unused",
    handler: async () => {
      ran = true;
      return { sent: true };
    },
  });

  const response = await POST(jsonRequest({ email: "ada@example.com" }));

  assert.equal(ran, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
});
