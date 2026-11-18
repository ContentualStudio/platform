import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingConfig,
  fakeDataSource,
  FakeBillingRepository,
  FakeStripeGateway,
  recordingAnalytics,
  testUser,
} from "./billing.testing";
import { CheckoutService } from "./checkout.service";
import { EntitlementService } from "./entitlement.service";
import { FoundingService } from "./founding.service";

function harness(configOverrides: Record<string, unknown> = {}) {
  const config = billingConfig(configOverrides);
  const repository = new FakeBillingRepository();
  const gateway = new FakeStripeGateway();
  const { events, analytics } = recordingAnalytics();
  const service = new CheckoutService(
    fakeDataSource as never,
    config,
    repository.asRepository(),
    new EntitlementService(repository.asRepository()),
    new FoundingService(config, repository.asRepository()),
    gateway,
    analytics as never,
  );

  return { service, repository, gateway, events };
}

test("a first checkout creates the Stripe customer once and starts a subscription session", async () => {
  const { service, repository, gateway, events } = harness();

  const first = await service.start(testUser, "pro");
  const second = await service.start(testUser, "pro");

  assert.equal(first.url, "https://checkout.stripe.test/cs");
  assert.equal(second.url, first.url);
  assert.equal(gateway.customers.length, 1, "the customer is created once and reused");
  assert.equal(repository.accounts.get("user-1")?.stripeCustomerId, "cus_1");
  assert.equal(gateway.checkouts.length, 2);

  const session = gateway.checkouts[0];
  assert.equal(session.customerId, "cus_1");
  assert.equal(session.userId, "user-1");
  assert.equal(session.priceId, "price_pro");
  assert.equal(
    session.successUrl,
    "https://app.example/settings/account?checkout=success&session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(session.cancelUrl, "https://app.example/settings/account?checkout=cancelled");
  assert.deepEqual(events.map((event) => event.event), ["checkout_started", "checkout_started"]);
});

test("Creator checks out at the founding price while a seat remains, with no alpha coupon on top", async () => {
  const { service, gateway } = harness();

  await service.start(testUser, "creator");

  const session = gateway.checkouts[0];
  assert.equal(session.priceId, "price_founding");
  assert.equal(session.couponId, undefined, "founding and alpha never stack");
  assert.equal(session.metadata.founding, "true");
  assert.equal(session.metadata.alpha, "false");
});

test("once the cohort is full Creator checks out at the normal price with the alpha coupon", async () => {
  const { service, repository, gateway } = harness();
  repository.claimed = 200;

  await service.start(testUser, "creator");

  const session = gateway.checkouts[0];
  assert.equal(session.priceId, "price_creator");
  assert.equal(session.couponId, "coupon_alpha");
  assert.equal(session.metadata.founding, "false");
  assert.equal(session.metadata.alpha, "true");
});

test("Pro never gets the founding price; it gets the alpha coupon while that offer is on", async () => {
  const { service, gateway } = harness();

  await service.start(testUser, "pro");

  assert.equal(gateway.checkouts[0].priceId, "price_pro");
  assert.equal(gateway.checkouts[0].couponId, "coupon_alpha");
});

test("with the alpha offer off, or its coupon unset, no discount is applied", async () => {
  const off = harness({
    offers: {
      founding: { enabled: false, appliesTo: "creator", cohortCap: 200 },
      alpha: { enabled: true, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: false, linkBase: "x" },
    },
  });

  await off.service.start(testUser, "creator");

  assert.equal(off.gateway.checkouts[0].priceId, "price_creator");
  assert.equal(off.gateway.checkouts[0].couponId, undefined);
});

test("a customer deleted in Stripe is replaced with a new one and checkout still starts", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount(testUser.id, { stripeCustomerId: "cus_gone" });
  gateway.deletedCustomers.add("cus_gone");

  const { url } = await service.start(testUser, "creator");

  assert.ok(url);
  assert.equal(gateway.customers.length, 1, "a fresh customer was created");
  assert.equal(gateway.checkouts[0].customerId, "cus_1");
  assert.equal((await repository.findAccount(testUser.id))?.stripeCustomerId, "cus_1");
});

test("a paying member cannot start a second subscription", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  repository.seedSubscription("user-1");

  await assert.rejects(() => service.start(testUser, "pro"), /already have an active subscription/);
  assert.equal(gateway.checkouts.length, 0);
});

test("a lapsed member can subscribe again", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  repository.seedSubscription("user-1", { status: "canceled" });

  await assert.doesNotReject(() => service.start(testUser, "creator"));
});

test("a tier without a configured price, and an unconfigured environment, both refuse", async () => {
  const unpriced = harness({ prices: { creator: "price_creator" } });
  await assert.rejects(() => unpriced.service.start(testUser, "pro"), /cannot be purchased/);

  const stub = harness({ configured: false });
  await assert.rejects(() => stub.service.start(testUser, "creator"), /not available/);
});

