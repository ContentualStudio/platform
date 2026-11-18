import * as assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { signRequestForTest, verifySignedRequest } from "./meta-signed-request";

const secret = "app-secret";
const valid = { user_id: "ig-1", algorithm: "HMAC-SHA256", issued_at: 1_800_000_000 };
const now = new Date(1_800_000_100 * 1000);

test("a correctly signed request verifies", () => {
  const result = verifySignedRequest(signRequestForTest(valid, secret), secret, now);

  assert.ok(result.ok);
  assert.equal(result.payload.user_id, "ig-1");
});

test("a request signed with another secret is rejected", () => {
  const result = verifySignedRequest(
    signRequestForTest(valid, "someone-elses-secret"),
    secret,
    now,
  );

  assert.ok(!result.ok);
  assert.equal(result.reason, "bad_signature");
});

// The classic implementation mistake: signing the decoded JSON instead of the
// encoded string. A verifier that did that would reject every real request.
test("the signature covers the encoded payload, not the decoded json", () => {
  const encodedPayload = Buffer.from(JSON.stringify(valid)).toString("base64url");
  const wrong = createHmac("sha256", secret)
    .update(JSON.stringify(valid))
    .digest("base64url");

  const result = verifySignedRequest(`${wrong}.${encodedPayload}`, secret, now);

  assert.ok(!result.ok);
  assert.equal(result.reason, "bad_signature");
});

test("a tampered payload no longer matches its signature", () => {
  const [signature] = signRequestForTest(valid, secret).split(".");
  const tampered = Buffer.from(
    JSON.stringify({ ...valid, user_id: "ig-victim" }),
  ).toString("base64url");

  const result = verifySignedRequest(`${signature}.${tampered}`, secret, now);

  assert.ok(!result.ok);
  assert.equal(result.reason, "bad_signature");
});

test("a malformed request is rejected rather than throwing", () => {
  for (const input of ["", "nodot", ".", "onlysignature."]) {
    const result = verifySignedRequest(input, secret, now);

    assert.ok(!result.ok);
  }
});

// Accepting whatever algorithm the payload names would let a caller downgrade
// to one we do not verify.
test("an unexpected algorithm is refused even when the signature matches", () => {
  const result = verifySignedRequest(
    signRequestForTest({ ...valid, algorithm: "none" }, secret),
    secret,
    now,
  );

  assert.ok(!result.ok);
  assert.equal(result.reason, "unexpected_algorithm");
});

test("a stale request is refused", () => {
  const result = verifySignedRequest(
    signRequestForTest(valid, secret),
    secret,
    new Date((1_800_000_000 + 48 * 60 * 60) * 1000),
  );

  assert.ok(!result.ok);
  assert.equal(result.reason, "stale");
});

test("a request naming no account is refused", () => {
  const result = verifySignedRequest(
    signRequestForTest({ algorithm: "HMAC-SHA256", issued_at: 1_800_000_000 }, secret),
    secret,
    now,
  );

  assert.ok(!result.ok);
  assert.equal(result.reason, "no_subject");
});

test("a signature of the wrong length is refused without throwing", () => {
  const [, encodedPayload] = signRequestForTest(valid, secret).split(".");

  const result = verifySignedRequest(`c2hvcnQ.${encodedPayload}`, secret, now);

  assert.ok(!result.ok);
  assert.equal(result.reason, "bad_signature");
});
