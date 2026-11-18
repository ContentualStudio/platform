import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import {
  anonymousIdFromRequest,
  POSTHOG_DISTINCT_ID_HEADER,
  preAuthIdentity,
} from "./anonymous-identity";

function requestWith(value: string | string[] | undefined): Request {
  return { headers: { [POSTHOG_DISTINCT_ID_HEADER]: value } } as unknown as Request;
}

test("reads the browser's distinct id", () => {
  assert.equal(
    anonymousIdFromRequest(requestWith("0198f2a1-6b3c-7000-8000-abc123def456")),
    "0198f2a1-6b3c-7000-8000-abc123def456",
  );
});

test("takes the first value when the header is repeated", () => {
  assert.equal(anonymousIdFromRequest(requestWith(["first", "second"])), "first");
});

test("an absent or blank header yields no id", () => {
  assert.equal(anonymousIdFromRequest(requestWith(undefined)), undefined);
  assert.equal(anonymousIdFromRequest(requestWith("   ")), undefined);
});

// The header is client-supplied, so it is sanitised to shape rather than trusted
// to be an opaque token.
test("a value outside the allowed alphabet is refused", () => {
  for (const rejected of [
    "has spaces",
    "semi;colon",
    '{"json":true}',
    "new\nline",
    "<script>",
  ]) {
    assert.equal(anonymousIdFromRequest(requestWith(rejected)), undefined);
  }
});

test("an over-long value is refused rather than truncated", () => {
  assert.equal(anonymousIdFromRequest(requestWith("a".repeat(201))), undefined);
});

test("a pre-auth identity is the browser's id when one was sent", () => {
  assert.deepEqual(preAuthIdentity(requestWith("anon-abc")), {
    anonymousId: "anon-abc",
  });
});

// No identity is better than a fictional one: an invented id strands the moment
// on a person PostHog can never join to the real user.
test("no identity when the browser sent nothing usable", () => {
  assert.equal(preAuthIdentity(requestWith(undefined)), undefined);
  assert.equal(preAuthIdentity(requestWith("not valid")), undefined);
});
