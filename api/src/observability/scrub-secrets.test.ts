import * as assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED } from "./redact";
import { scrubError, scrubText } from "./scrub-secrets";

const longLivedToken = "IGQVJYaGxsdGVzdHRva2VuZm9yc2NydWJiaW5n";

test("an instagram token is scrubbed out of a message", () => {
  const scrubbed = scrubText(`refresh failed for token ${longLivedToken}`);

  assert.ok(!scrubbed.includes(longLivedToken));
  assert.ok(scrubbed.includes(REDACTED));
});

// Regression: a group-less pattern receives the match offset where a capture
// group would be, so a shared replacer callback once emitted "<offset>=[redacted]"
// instead of the marker. Assert the exact output, not merely the absence.
test("a token away from the start of the line scrubs to exactly the marker", () => {
  assert.equal(scrubText(`v=${longLivedToken}`), `v=${REDACTED}`);
  assert.equal(
    scrubText(`prefix ${longLivedToken} suffix`),
    `prefix ${REDACTED} suffix`,
  );
});

test("a facebook token is scrubbed", () => {
  const token = "EAAGm0PX4ZCpsBAtestfacebooktokenvalue";

  assert.ok(!scrubText(`Bearer ${token}`).includes(token));
});

test("an access_token query parameter keeps its name and loses its value", () => {
  const scrubbed = scrubText(
    "GET https://graph.instagram.com/me?fields=id&access_token=abc123def456",
  );

  assert.ok(scrubbed.includes(`access_token=${REDACTED}`));
  assert.ok(!scrubbed.includes("abc123def456"));
  // The diagnosable part of the line survives.
  assert.ok(scrubbed.includes("graph.instagram.com/me"));
});

test("a client secret and an oauth code are scrubbed", () => {
  const scrubbed = scrubText("client_secret=s3cr3tvalue&code=authcode123");

  assert.ok(!scrubbed.includes("s3cr3tvalue"));
  assert.ok(!scrubbed.includes("authcode123"));
});

test("an authorization header value is scrubbed", () => {
  const scrubbed = scrubText("Authorization: Bearer sk-abcdefgh12345678");

  assert.ok(!scrubbed.includes("sk-abcdefgh12345678"));
});

test("a long mixed-case-and-digit run is scrubbed as a backstop", () => {
  const unknownToken = "Xy7".repeat(16);

  assert.ok(!scrubText(`opaque ${unknownToken} value`).includes(unknownToken));
});

// The backstop must not eat diagnostics. Each of these is long but is missing
// one of the three character classes a token carries.
test("long strings that are not token-shaped survive the backstop", () => {
  for (const value of [
    "x".repeat(2_000),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "THIS_IS_A_VERY_LONG_SCREAMING_CONSTANT_NAME_FOR_SOMETHING",
  ]) {
    assert.equal(scrubText(value), value);
  }
});

// Over-redaction is its own failure: once everything is redacted nobody reads
// the logs. These are the shapes that must survive.
test("ordinary log lines pass through untouched", () => {
  for (const line of [
    "Backfill run 12 for rule welcome-badge: users inScope=4 fired=2",
    "GET /instagram/analytics/snapshot 200 in 14ms",
    'failed with {"code":"PLATFORM_NOT_CONNECTED"}',
    "follower.milestone:user-1:100",
    "user 0f9a1c2e-5b3d-4a7e-9c8f-1d2e3f4a5b6c connected",
    "status_code=404 path=/instagram/connect",
  ]) {
    assert.equal(scrubText(line), line, `line was altered: ${line}`);
  }
});

test("scrubError rewrites message, stack and cause without mutating the original", () => {
  const cause = new Error(`cause holds ${longLivedToken}`);
  const original = new Error(`outer holds ${longLivedToken}`);
  (original as { cause?: unknown }).cause = cause;

  const scrubbed = scrubError(original) as Error;

  assert.ok(!scrubbed.message.includes(longLivedToken));
  assert.ok(!String(scrubbed.stack).includes(longLivedToken));
  assert.ok(
    !((scrubbed as { cause?: Error }).cause as Error).message.includes(
      longLivedToken,
    ),
  );
  assert.equal(scrubbed.name, original.name);
  // The caller's object is untouched — an error reporter must not rewrite the
  // objects its caller still holds.
  assert.ok(original.message.includes(longLivedToken));
});

test("scrubError passes non-errors through the string scrub", () => {
  assert.equal(scrubError(`v=${longLivedToken}`), `v=${REDACTED}`);
  assert.equal(scrubError(42), 42);
});
