import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BillingConfigService } from "./billing-config.service";
import { tierKeys } from "./billing-tiers";

function service(values: Record<string, unknown>) {
  const config = {
    get: (key: string) => {
      // Mirrors ConfigService's dotted lookup over the loaded namespace.
      return key
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === "object"
              ? (node as Record<string, unknown>)[part]
              : undefined,
          { billing: values },
        );
    },
  };

  return new BillingConfigService(config as never);
}

const provisioned = {
  configured: true,
  prices: { creator: "price_creator", pro: "price_pro" },
  offers: {
    founding: { enabled: true, appliesTo: tierKeys.creator, cohortCap: 200 },
    alpha: {
      enabled: true,
      discountPercent: 50,
      durationMonths: 3,
      stripeDiscountId: "coupon_alpha",
    },
  },
};

test("tiers list in order through the service", () => {
  assert.deepEqual(
    service(provisioned)
      .listTiers()
      .map((entry) => entry.key),
    ["free", "creator", "pro"],
  );
});

test("a tier resolves by key, and an unknown key resolves to undefined", () => {
  const billing = service(provisioned);

  assert.equal(billing.findTier("pro")?.displayName, "Pro");
  assert.equal(billing.findTier("enterprise"), undefined);
});

test("a paid tier returns its configured price id", () => {
  assert.equal(service(provisioned).priceIdFor(tierKeys.creator), "price_creator");
});

test("Free has no price id", () => {
  assert.equal(service(provisioned).priceIdFor(tierKeys.free), undefined);
});

test("checkout is possible only for a paid tier with a price in a provisioned environment", () => {
  const billing = service(provisioned);

  assert.equal(billing.canCheckOut(tierKeys.creator), true);
  assert.equal(billing.canCheckOut(tierKeys.free), false);
});

test("no tier can check out when Stripe is not provisioned", () => {
  const billing = service({ ...provisioned, configured: false });

  assert.equal(billing.canCheckOut(tierKeys.creator), false);
  assert.equal(billing.canCheckOut(tierKeys.pro), false);
});

test("a paid tier with no configured price cannot check out", () => {
  const billing = service({ ...provisioned, prices: { creator: "price_creator" } });

  assert.equal(billing.canCheckOut(tierKeys.creator), true);
  assert.equal(billing.canCheckOut(tierKeys.pro), false);
});

test("the founding offer reads through the service", () => {
  const founding = service(provisioned).foundingOffer();

  assert.equal(founding.enabled, true);
  assert.equal(founding.appliesTo, tierKeys.creator);
  assert.equal(founding.cohortCap, 200);
});

test("the alpha offer reads through the service", () => {
  const alpha = service(provisioned).alphaOffer();

  assert.equal(alpha.enabled, true);
  assert.equal(alpha.discountPercent, 50);
  assert.equal(alpha.durationMonths, 3);
});

test("the alpha offer reports disabled when no discount identifier is configured", () => {
  const alpha = service({
    ...provisioned,
    offers: {
      ...provisioned.offers,
      alpha: { ...provisioned.offers.alpha, stripeDiscountId: undefined },
    },
  }).alphaOffer();

  // Advertising a discount that cannot be applied charges the customer full
  // price after showing them half.
  assert.equal(alpha.enabled, false);
});

test("the pricing-facing tier list carries no Stripe price identifier", () => {
  const publicTiers = service(provisioned).publicTiers();

  for (const entry of publicTiers) {
    assert.equal("priceId" in entry, false);
    assert.equal(
      JSON.stringify(entry).includes("price_"),
      false,
      `${entry.key} leaked a Stripe price id to the client`,
    );
  }
});

test("the pricing-facing list still carries what a pricing table renders", () => {
  const [free] = service(provisioned).publicTiers();

  assert.equal(free?.displayName, "Free");
  assert.equal(free?.order, 0);
  assert.equal(free?.analytics, true);
  assert.equal(free?.checkout, false);
});
