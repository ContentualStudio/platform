import * as assert from "node:assert/strict";
import { test } from "node:test";
import { StubInstagramApi } from "./stub-instagram-api";

// The stub is not incidental: with no Meta app provisioned it is the only way
// the connect flow, the daily pull and every degradation path can be run at
// all. So its scenarios are tested like production code.
const api = new StubInstagramApi();

async function tokenFor(descriptor: string): Promise<string> {
  const short = await api.exchangeCode(descriptor);
  assert.ok(short.ok);

  const long = await api.exchangeForLongLived(short.value.accessToken);
  assert.ok(long.ok);

  return long.value.accessToken;
}

test("a descriptor drives the account it produces", async () => {
  const result = await api.fetchAccount(await tokenFor("creator:1200"));

  assert.ok(result.ok);
  assert.equal(result.value.username, "creator");
  assert.equal(result.value.followerCount, 1200);
  assert.equal(result.value.accountType, "professional");
});

test("a personal account can be produced on demand", async () => {
  const result = await api.fetchAccount(await tokenFor("creator:50:personal"));

  assert.ok(result.ok);
  assert.equal(result.value.accountType, "personal");
  assert.equal(result.value.followerCount, 50);
});

test("the short-lived token really is short lived", async () => {
  const short = await api.exchangeCode("creator:10");

  assert.ok(short.ok);
  assert.equal(short.value.expiresInSeconds, 3_600);
});

test("exchange and refresh both yield sixty days", async () => {
  const short = await api.exchangeCode("creator:10");
  assert.ok(short.ok);

  const long = await api.exchangeForLongLived(short.value.accessToken);
  assert.ok(long.ok);
  assert.equal(long.value.expiresInSeconds, 60 * 24 * 3_600);

  const refreshed = await api.refreshToken(long.value.accessToken);
  assert.ok(refreshed.ok);
  assert.equal(refreshed.value.expiresInSeconds, 60 * 24 * 3_600);
});

// The two real gates, so the degradation paths are exercisable without Meta.
test("a personal account is refused insights as a permission failure", async () => {
  const result = await api.fetchAccountInsights(
    await tokenFor("creator:5000:personal"),
    "stub:creator",
  );

  assert.ok(!result.ok);
  assert.equal(result.kind, "permission");
});

test("an account under a hundred followers is refused gated insights", async () => {
  const result = await api.fetchAccountInsights(
    await tokenFor("creator:99"),
    "stub:creator",
  );

  assert.ok(!result.ok);
  assert.equal(result.kind, "permission");
});

test("an account at the hundred-follower boundary gets insights", async () => {
  const result = await api.fetchAccountInsights(
    await tokenFor("creator:100"),
    "stub:creator",
  );

  assert.ok(result.ok);
  assert.equal(result.value.reach, 60);
});

// A missing metric is a normal outcome and must stay null rather than becoming
// a zero that would read as "nobody saved this post".
test("media insights carry a genuinely absent metric", async () => {
  const result = await api.fetchMediaWithInsights(await tokenFor("creator:200"));

  assert.ok(result.ok);
  assert.equal(result.value.length, 3);
  assert.equal(result.value[2].saved, null);
  assert.equal(result.value[0].views, 200);
});

test("an unrecognised token is an auth failure, not a crash", async () => {
  for (const call of [
    api.fetchAccount("nonsense"),
    api.refreshToken("nonsense"),
    api.fetchMediaWithInsights("nonsense"),
    api.revoke("nonsense"),
  ]) {
    const result = await call;

    assert.ok(!result.ok);
    assert.equal(result.kind, "auth");
  }
});

test("a code naming no handle is invalid rather than an empty account", async () => {
  const result = await api.exchangeCode("  ");

  assert.ok(!result.ok);
  assert.equal(result.kind, "invalid");
});

// Stateless: the same descriptor twice gives the same account, and nothing is
// remembered between calls.
test("the stub is deterministic and holds no state", async () => {
  const first = await api.fetchAccount(await tokenFor("creator:777"));
  const second = await api.fetchAccount(await tokenFor("creator:777"));

  assert.deepEqual(first, second);
});
