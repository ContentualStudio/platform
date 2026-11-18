import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveSubscriptionState,
  effectiveTierFor,
  isPaidStatus,
  normalizeStripeCheckoutSession,
  normalizeStripeInvoice,
  normalizeStripeSubscription,
} from "./subscription-state";

const PRICES = { price_creator: "creator", price_pro: "pro" } as const;

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: {
      data: [
        {
          price: { id: "price_creator", unit_amount: 2900, currency: "usd" },
          current_period_end: 1_800_000_000,
        },
      ],
    },
    metadata: { userId: "user-1" },
    invented_by_stripe_later: { nested: true },
    ...overrides,
  };
}

test("active, trialing and past_due keep the paid tier; everything else is Free", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    assert.equal(isPaidStatus(status), true, status);
    assert.equal(effectiveTierFor(status, "creator"), "creator", status);
  }

  for (const status of ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(isPaidStatus(status), false, status);
    assert.equal(effectiveTierFor(status, "pro"), "free", status);
  }

  assert.equal(effectiveTierFor(null, null), "free");
  assert.equal(effectiveTierFor("active", "free"), "free", "free is never a subscription tier");
  assert.equal(effectiveTierFor("active", "enterprise"), "free", "an unknown tier entitles nothing");
});

test("a Stripe subscription normalises to the fields Billing stores", () => {
  const snapshot = normalizeStripeSubscription(stripeSubscription());

  assert.deepEqual(snapshot, {
    id: "sub_1",
    customerId: "cus_1",
    status: "active",
    priceId: "price_creator",
    unitAmount: 2900,
    currency: "usd",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 1_800_000_000,
    canceledAt: null,
    endedAt: null,
    metadata: { userId: "user-1" },
  });
});

test("the period end is read from the item on new API versions and the top level on old ones", () => {
  const legacy = normalizeStripeSubscription(
    stripeSubscription({
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { id: "price_creator" } }] },
    }),
  );

  assert.equal(legacy?.currentPeriodEnd, 1_700_000_000);
  assert.equal(legacy?.unitAmount, null);
});

test("an expanded customer object and a missing metadata block are both readable", () => {
  const snapshot = normalizeStripeSubscription(
    stripeSubscription({ customer: { id: "cus_2" }, metadata: undefined }),
  );

  assert.equal(snapshot?.customerId, "cus_2");
  assert.deepEqual(snapshot?.metadata, {});
});

test("an object that is not a subscription, or carries an unknown status, is not interpreted", () => {
  assert.equal(normalizeStripeSubscription({ id: "sub_1" }), undefined);
  assert.equal(
    normalizeStripeSubscription(stripeSubscription({ status: "mystery" })),
    undefined,
  );
});

test("state derives from the configured price, and an unknown price derives nothing", () => {
  const known = deriveSubscriptionState(
    normalizeStripeSubscription(stripeSubscription({ cancel_at_period_end: true }))!,
    PRICES,
  );

  assert.equal(known?.tier, "creator");
  assert.equal(known?.status, "active");
  assert.equal(known?.cancelAtPeriodEnd, true);
  assert.equal(known?.currentPeriodEnd?.toISOString(), "2027-01-15T08:00:00.000Z");
  assert.equal(known?.stripePriceId, "price_creator");

  const unknown = deriveSubscriptionState(
    normalizeStripeSubscription(
      stripeSubscription({ items: { data: [{ price: { id: "price_other" } }] } }),
    )!,
    PRICES,
  );

  assert.equal(unknown, undefined);
});

test("a checkout session and an invoice normalise their customer and subscription references", () => {
  assert.deepEqual(
    normalizeStripeCheckoutSession({
      id: "cs_1",
      customer: "cus_1",
      client_reference_id: "user-1",
      subscription: { id: "sub_1" },
      metadata: { tier: "creator" },
    }),
    {
      id: "cs_1",
      customerId: "cus_1",
      clientReferenceId: "user-1",
      subscriptionId: "sub_1",
      metadata: { tier: "creator" },
    },
  );

  assert.deepEqual(
    normalizeStripeInvoice({
      id: "in_1",
      customer: { id: "cus_1" },
      parent: { subscription_details: { subscription: "sub_1" } },
    }),
    { id: "in_1", customerId: "cus_1", subscriptionId: "sub_1" },
  );

  assert.equal(
    normalizeStripeInvoice({ id: "in_2", customer: "cus_1", subscription: "sub_9" })
      ?.subscriptionId,
    "sub_9",
  );
});
