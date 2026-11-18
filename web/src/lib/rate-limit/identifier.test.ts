import * as assert from "node:assert/strict";
import { test } from "node:test";
import { clientIpFromHeaders, identifierFor } from "./identifier";

test("x-forwarded-for uses the left-most address, the original client", () => {
  const headers = new Headers({
    "x-forwarded-for": " 203.0.113.10, 10.0.0.1, 192.168.0.1 ",
  });

  assert.equal(clientIpFromHeaders(headers), "203.0.113.10");
});

test("x-real-ip is used when x-forwarded-for is absent", () => {
  const headers = new Headers({ "x-real-ip": "198.51.100.20" });

  assert.equal(clientIpFromHeaders(headers), "198.51.100.20");
});

test("a request with no IP still gets a key, so it is not unmetered", () => {
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
});

test("auth identifiers key on IP even when a user id is present", () => {
  assert.equal(
    identifierFor("auth", { ip: "203.0.113.10", userId: "user-1" }),
    "ip:203.0.113.10",
  );
});

test("mutation and analytics-refresh identifiers key on the user", () => {
  assert.equal(
    identifierFor("mutation", { ip: "203.0.113.10", userId: "user-1" }),
    "user:user-1",
  );
  assert.equal(
    identifierFor("analyticsRefresh", {
      ip: "203.0.113.10",
      userId: "user-1",
    }),
    "user:user-1",
  );
});

test("a user-keyed limiter falls back to IP when the session is unknown", () => {
  assert.equal(
    identifierFor("mutation", { ip: "203.0.113.10" }),
    "ip:203.0.113.10",
  );
});
