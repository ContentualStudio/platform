import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  maxPropertyStringLength,
  REDACTED,
  redactProperties,
} from "./redact";

test("an absent property bag becomes an empty one", () => {
  assert.deepEqual(redactProperties(undefined), {});
});

test("a login code cannot survive redaction", () => {
  assert.deepEqual(redactProperties({ code: "123456", email: "a@b.test" }), {
    code: REDACTED,
    email: REDACTED,
  });
});

test("secret-bearing keys are redacted whatever their spelling", () => {
  assert.deepEqual(
    redactProperties({
      accessToken: "t",
      api_key: "k",
      loginCode: "c",
      Authorization: "bearer x",
      userPassword: "p",
    }),
    {
      accessToken: REDACTED,
      api_key: REDACTED,
      loginCode: REDACTED,
      Authorization: REDACTED,
      userPassword: REDACTED,
    },
  );
});

// The point of matching these exactly rather than as fragments: over-redaction
// destroys the properties the team actually slices on.
test("keys that merely contain a sensitive word are kept", () => {
  assert.deepEqual(
    redactProperties({
      countryCode: "GB",
      statusCode: 500,
      emailVerified: true,
      keyboardShortcut: "cmd+k",
    }),
    {
      countryCode: "GB",
      statusCode: 500,
      emailVerified: true,
      keyboardShortcut: "cmd+k",
    },
  );
});

test("redaction reaches nested objects and arrays", () => {
  assert.deepEqual(
    redactProperties({
      request: { headers: { cookie: "session=abc" }, method: "POST" },
      attempts: [{ otp: "1" }, { otp: "2" }],
    }),
    {
      request: { headers: { cookie: REDACTED }, method: "POST" },
      attempts: [{ otp: REDACTED }, { otp: REDACTED }],
    },
  );
});

test("long strings are truncated rather than shipped whole", () => {
  const result = redactProperties({ message: "x".repeat(2_000) });
  const message = result.message as string;

  assert.equal(message.length, maxPropertyStringLength + 1);
  assert.ok(message.endsWith("…"));
});

test("values that do not survive the wire are dropped", () => {
  assert.deepEqual(
    redactProperties({
      kept: 1,
      absent: undefined,
      callback: () => undefined,
      notANumber: Number.NaN,
      unbounded: Number.POSITIVE_INFINITY,
    }),
    { kept: 1 },
  );
});

test("dates become ISO strings", () => {
  assert.deepEqual(redactProperties({ at: new Date("2026-08-17T09:30:00Z") }), {
    at: "2026-08-17T09:30:00.000Z",
  });
});

test("null is a meaningful value and is kept", () => {
  assert.deepEqual(redactProperties({ programmeId: null }), {
    programmeId: null,
  });
});

// A cycle here would recurse until the stack gave out, taking down the request
// that was only trying to report on itself.
test("a circular reference does not blow the stack", () => {
  const input: Record<string, unknown> = { name: "outer" };
  input.self = input;

  assert.deepEqual(redactProperties(input), { name: "outer" });
});
