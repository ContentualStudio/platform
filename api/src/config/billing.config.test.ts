import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import billingConfig from "./billing.config";

const KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_CREATOR",
  "STRIPE_PRICE_PRO",
  "STRIPE_ALPHA_COUPON_ID",
  "BILLING_FOUNDING_OFFER_ENABLED",
  "BILLING_FOUNDING_COHORT_CAP",
  "BILLING_ALPHA_OFFER_ENABLED",
  "BILLING_ALPHA_DISCOUNT_PERCENT",
  "BILLING_ALPHA_DISCOUNT_MONTHS",
];

function clear() {
  for (const key of KEYS) {
    delete process.env[key];
  }
}

afterEach(clear);

test("with nothing provisioned the config still loads and reports unconfigured", () => {
  clear();

  const { billing } = billingConfig();

  assert.equal(billing.configured, false);
  assert.deepEqual(billing.prices, {});
});

test("a secret key with no configured price is still unconfigured", () => {
  clear();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";

  // Checkout would start and then fail at Stripe, which is worse than being
  // switched off, so both halves are required.
  assert.equal(billingConfig().billing.configured, false);
});

test("price ids are read per tier from the environment", () => {
  clear();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_PRICE_CREATOR = "price_creator";
  process.env.STRIPE_PRICE_PRO = "price_pro";

  const { billing } = billingConfig();

  assert.equal(billing.configured, true);
  assert.deepEqual(billing.prices, {
    creator: "price_creator",
    pro: "price_pro",
  });
});

test("Free never has a price id", () => {
  clear();
  process.env.STRIPE_PRICE_CREATOR = "price_creator";

  assert.equal("free" in billingConfig().billing.prices, false);
});

test("a blank price variable is treated as absent, not as an empty id", () => {
  clear();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_PRICE_CREATOR = "   ";

  assert.deepEqual(billingConfig().billing.prices, {});
});

test("the founding offer defaults to on, Creator, capped at 200", () => {
  clear();

  const { founding } = billingConfig().billing.offers;

  assert.equal(founding.enabled, true);
  assert.equal(founding.appliesTo, "creator");
  assert.equal(founding.cohortCap, 200);
});

test("the founding offer can be switched off and recapped without a deploy", () => {
  clear();
  process.env.BILLING_FOUNDING_OFFER_ENABLED = "false";
  process.env.BILLING_FOUNDING_COHORT_CAP = "50";

  const { founding } = billingConfig().billing.offers;

  assert.equal(founding.enabled, false);
  assert.equal(founding.cohortCap, 50);
});

test("a nonsense cohort cap falls back to 200 rather than uncapping the cohort", () => {
  clear();
  process.env.BILLING_FOUNDING_COHORT_CAP = "not-a-number";

  assert.equal(billingConfig().billing.offers.founding.cohortCap, 200);
});

test("the alpha offer defaults to 3 months at 50% off", () => {
  clear();

  const { alpha } = billingConfig().billing.offers;

  assert.equal(alpha.discountPercent, 50);
  assert.equal(alpha.durationMonths, 3);
});

test("the alpha discount identifier is read from the environment", () => {
  clear();
  process.env.STRIPE_ALPHA_COUPON_ID = "coupon_alpha";

  assert.equal(
    billingConfig().billing.offers.alpha.stripeDiscountId,
    "coupon_alpha",
  );
});
