import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultTier,
  type BillingTier,
  findTier,
  listTiers,
  parseTierKey,
  programmeSets,
  tier,
  tierKeys,
} from "./billing-tiers";

test("the vocabulary is exactly Free, Creator and Pro, cheapest first", () => {
  assert.deepEqual(
    listTiers().map((entry) => entry.key),
    ["free", "creator", "pro"],
  );
});

test("every tier carries the facts a pricing table renders", () => {
  for (const entry of listTiers()) {
    assert.ok(entry.displayName.length > 0, `${entry.key} has no display name`);
    assert.equal(typeof entry.order, "number");
    assert.equal(typeof entry.earlyAccess, "boolean");
  }
});

test("analytics are available on every tier, Free included", () => {
  assert.equal(
    listTiers().every((entry) => entry.analytics),
    true,
  );
});

test("Free unlocks the limited programme set; the paid tiers unlock the full one", () => {
  assert.equal(tier(tierKeys.free).programmeSet, programmeSets.limited);
  assert.equal(tier(tierKeys.creator).programmeSet, programmeSets.full);
  assert.equal(tier(tierKeys.pro).programmeSet, programmeSets.full);
});

test("early access is a Pro-only entitlement", () => {
  assert.deepEqual(
    listTiers()
      .filter((entry) => entry.earlyAccess)
      .map((entry) => entry.key),
    ["pro"],
  );
});

test("Free does not check out; the paid tiers do", () => {
  assert.equal(tier(tierKeys.free).checkout, false);
  assert.equal(tier(tierKeys.creator).checkout, true);
  assert.equal(tier(tierKeys.pro).checkout, true);
});

test("ordering is unique, so a pricing table cannot render two tiers in one slot", () => {
  const orders = listTiers().map((entry) => entry.order);

  assert.equal(new Set(orders).size, orders.length);
});

test("an unknown key resolves to undefined rather than throwing", () => {
  assert.equal(findTier("enterprise"), undefined);
  assert.equal(findTier(null), undefined);
  assert.equal(findTier(7), undefined);
  assert.equal(parseTierKey("enterprise"), undefined);
});

test("a known key narrows and resolves", () => {
  assert.equal(parseTierKey("creator"), tierKeys.creator);
  assert.equal(findTier("creator")?.displayName, "Creator");
});

test("an account with no subscription falls back to Free", () => {
  assert.equal(defaultTier().key, tierKeys.free);
});

test("the tier list cannot be mutated by a caller", () => {
  const tiers = listTiers() as unknown as BillingTier[];

  // Frozen at runtime, not just readonly at compile time: a surface that
  // sorted this in place would reorder the pricing table for every caller.
  assert.throws(() => tiers.push({} as BillingTier));
  assert.deepEqual(
    listTiers().map((entry) => entry.key),
    ["free", "creator", "pro"],
  );
});
