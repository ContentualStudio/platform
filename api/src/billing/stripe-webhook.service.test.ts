import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import {
  billingConfig,
  fakeDataSource,
  FakeBillingRepository,
  FakeStripeGateway,
  recordingAnalytics,
  recordingErrorTracking,
  subscriptionEvent,
} from "./billing.testing";
import { FoundingService } from "./founding.service";
import { ReferralService } from "./referral.service";
import { StripeWebhookService } from "./stripe-webhook.service";

function harness(configOverrides: Record<string, unknown> = {}) {
  const config = billingConfig(configOverrides);
  const repository = new FakeBillingRepository();
  const gateway = new FakeStripeGateway();
  const { errors, tracking } = recordingErrorTracking();
  const { events: captured, analytics } = recordingAnalytics();
  const emitted: { eventId: string; eventName: string; payload: unknown }[] = [];
  const dispatched: string[] = [];
  const emitter = {
    emit: async (_manager: unknown, input: { eventId: string; eventName: string; payload: unknown }) => {
      emitted.push(input);
      return { id: input.eventId, eventName: input.eventName, userId: "", payload: input.payload };
    },
  };
  const dispatcher = { dispatch: async (id: string) => void dispatched.push(id) };
  const founding = new FoundingService(config, repository.asRepository());
  const referral = new ReferralService(
    config,
    repository.asRepository(),
    gateway,
    analytics as never,
  );
  const service = new StripeWebhookService(
    fakeDataSource as never,
    config,
    repository.asRepository(),
    founding,
    referral,
    emitter as never,
    dispatcher as never,
    tracking as never,
    gateway,
    analytics as never,
  );

  return { service, repository, gateway, emitted, dispatched, errors, captured };
}

test("a new paid subscription is stored, marks the first paid month and emits subscription.started", async () => {
  const { service, repository, emitted, dispatched } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  const outcome = await service.process(subscriptionEvent());

  assert.equal(outcome, "applied");
  const stored = repository.subscriptions.get("user-1");
  assert.equal(stored?.tier, "creator");
  assert.equal(stored?.status, "active");
  assert.equal(stored?.stripeSubscriptionId, "sub_1");
  assert.equal(stored?.lastEventCreated, 2_000);
  assert.equal(repository.accounts.get("user-1")?.firstPaidAt?.getTime(), 2_000 * 1000);
  assert.deepEqual(
    emitted.map((event) => [event.eventName, event.payload]),
    [[eventNameTokens.subscriptionStarted, { userId: "user-1", tier: "creator", foundingCreator: false }]],
  );
  assert.deepEqual(dispatched, [emitted[0].eventId]);
  assert.equal(repository.ledger.get("evt_1")?.outcome, "applied");
});

test("the same event delivered twice is a no-op the second time", async () => {
  const { service, repository, emitted } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  assert.equal(await service.process(subscriptionEvent()), "applied");
  assert.equal(await service.process(subscriptionEvent()), "duplicate");
  assert.equal(emitted.length, 1);
});

test("an older event cannot regress state a newer one already wrote", async () => {
  const { service, repository, emitted } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  await service.process(subscriptionEvent({ id: "evt_new", created: 3_000 }));
  const outcome = await service.process(
    subscriptionEvent({ id: "evt_old", created: 2_000, status: "canceled" }),
  );

  assert.equal(outcome, "stale");
  assert.equal(repository.subscriptions.get("user-1")?.status, "active");
  assert.equal(emitted.length, 1);
  assert.equal(repository.ledger.get("evt_old")?.outcome, "stale");
});

test("the tail of an old subscription cannot overwrite a live replacement", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  repository.seedSubscription("user-1", { stripeSubscriptionId: "sub_new", lastEventCreated: 100 });

  const outcome = await service.process(
    subscriptionEvent({
      id: "evt_old_sub",
      type: "customer.subscription.deleted",
      subscriptionId: "sub_old",
      status: "canceled",
      created: 5_000,
    }),
  );

  assert.equal(outcome, "stale");
  assert.equal(repository.subscriptions.get("user-1")?.stripeSubscriptionId, "sub_new");
});

test("a deleted subscription returns the user to Free and emits subscription.ended", async () => {
  const { service, repository, emitted } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1", firstPaidAt: new Date() });
  repository.seedSubscription("user-1", { stripeSubscriptionId: "sub_1" });

  const outcome = await service.process(
    subscriptionEvent({ id: "evt_del", type: "customer.subscription.deleted", status: "canceled" }),
  );

  assert.equal(outcome, "applied");
  assert.equal(repository.subscriptions.get("user-1")?.status, "canceled");
  assert.deepEqual(emitted.map((event) => [event.eventName, event.payload]), [
    [eventNameTokens.subscriptionEnded, { userId: "user-1", previousTier: "creator" }],
  ]);
});

test("past_due keeps the tier and emits nothing; a tier switch emits subscription.changed", async () => {
  const { service, repository, emitted } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1", firstPaidAt: new Date() });
  repository.seedSubscription("user-1", { stripeSubscriptionId: "sub_1" });

  await service.process(
    subscriptionEvent({ id: "evt_due", type: "customer.subscription.updated", status: "past_due" }),
  );
  assert.equal(repository.subscriptions.get("user-1")?.status, "past_due");
  assert.equal(emitted.length, 0);

  await service.process(
    subscriptionEvent({
      id: "evt_pro",
      type: "customer.subscription.updated",
      status: "active",
      priceId: "price_pro",
      created: 2_001,
    }),
  );
  assert.equal(repository.subscriptions.get("user-1")?.tier, "pro");
  assert.deepEqual(emitted.map((event) => [event.eventName, event.payload]), [
    [eventNameTokens.subscriptionChanged, { userId: "user-1", tier: "pro", previousTier: "creator" }],
  ]);
});

test("a founding-price purchase takes a seat, stores the locked price and flags the account", async () => {
  const { service, repository, emitted } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  await service.process(subscriptionEvent({ priceId: "price_founding" }));

  const account = repository.accounts.get("user-1");
  assert.equal(account?.isFoundingCreator, true);
  assert.equal(account?.foundingLockedAmount, 1900);
  assert.equal(account?.foundingLockedCurrency, "usd");
  assert.equal(repository.claimed, 1);
  assert.equal(repository.subscriptions.get("user-1")?.tier, "creator", "the founding price sells Creator");
  assert.deepEqual(emitted[0].payload, { userId: "user-1", tier: "creator", foundingCreator: true });
});

test("the cohort cap holds: the purchase past it is recorded and reported, not flagged", async () => {
  const { service, repository, errors, captured } = harness({
    offers: {
      founding: { enabled: true, appliesTo: "creator", cohortCap: 1, priceId: "price_founding" },
      alpha: { enabled: false, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: false, linkBase: "x" },
    },
  });
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  repository.seedAccount("user-2", { stripeCustomerId: "cus_2" });

  await service.process(subscriptionEvent({ id: "evt_a", priceId: "price_founding" }));
  await service.process(
    subscriptionEvent({ id: "evt_b", subscriptionId: "sub_2", customer: "cus_2", priceId: "price_founding" }),
  );

  assert.equal(repository.accounts.get("user-1")?.isFoundingCreator, true);
  assert.equal(repository.accounts.get("user-2")?.isFoundingCreator, false);
  assert.equal(repository.subscriptions.get("user-2")?.tier, "creator", "still a paying Creator");
  assert.equal(repository.claimed, 1);
  assert.ok(errors.some((error) => error.message.includes("Founding cohort is full")));
  assert.ok(captured.some((event) => event.event === "founding_cohort_full"));
});

test("a referred user's first paid month converts the referral and rewards a paying referrer", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r", firstPaidAt: new Date() });
  repository.seedSubscription("referrer", { stripeSubscriptionId: "sub_r" });
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  await repository.insertReferral({ referrerUserId: "referrer", referredUserId: "user-1", referralCode: "abc" });

  await service.process(subscriptionEvent());

  assert.equal(repository.referrals[0].status, "rewarded");
  assert.deepEqual(gateway.credits, [{ customerId: "cus_r", amount: 2900, currency: "usd", description: "Referral reward: one month free", idempotencyKey: "referral-reward-ref_1" }]);

  // A renewal of the referred user is not a second conversion.
  await service.process(
    subscriptionEvent({ id: "evt_renew", type: "customer.subscription.updated", created: 2_500 }),
  );
  assert.equal(gateway.credits.length, 1);
});

test("a reward for a referrer who is not paying is banked until their next paid invoice", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r" });
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  await repository.insertReferral({ referrerUserId: "referrer", referredUserId: "user-1", referralCode: "abc" });

  await service.process(subscriptionEvent());
  assert.equal(repository.referrals[0].status, "converted");
  assert.equal(gateway.credits.length, 0);

  // The referrer subscribes later: their own start applies the banked reward.
  await service.process(
    subscriptionEvent({ id: "evt_r", subscriptionId: "sub_r", customer: "cus_r", created: 3_000 }),
  );
  assert.equal(repository.referrals[0].status, "rewarded");
  assert.deepEqual(gateway.credits, [{ customerId: "cus_r", amount: 2900, currency: "usd", description: "Referral reward: one month free", idempotencyKey: "referral-reward-ref_1" }]);
});

test("a paid invoice applies the next banked reward, one per invoice", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r", firstPaidAt: new Date() });
  repository.seedSubscription("referrer", { stripeSubscriptionId: "sub_r" });
  for (const referred of ["u-a", "u-b"]) {
    repository.seedAccount(referred);
    await repository.insertReferral({ referrerUserId: "referrer", referredUserId: referred, referralCode: "abc" });
    await repository.markReferralConverted(referred, "evt_x", new Date());
  }

  const invoice = {
    id: "evt_inv",
    type: "invoice.paid",
    created: 4_000,
    object: { id: "in_1", customer: "cus_r", parent: { subscription_details: { subscription: "sub_r" } } },
  };

  assert.equal(await service.process(invoice), "applied");
  assert.equal(gateway.credits.length, 1);
  assert.deepEqual(
    repository.referrals.map((row) => row.status),
    ["rewarded", "converted"],
  );
});

test("a failed credit leaves the referral converted so the next invoice retries it", async () => {
  const { service, repository, gateway, errors } = harness();
  gateway.failCredits = true;
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r", firstPaidAt: new Date() });
  repository.seedSubscription("referrer", { stripeSubscriptionId: "sub_r" });
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  await repository.insertReferral({ referrerUserId: "referrer", referredUserId: "user-1", referralCode: "abc" });

  assert.equal(await service.process(subscriptionEvent()), "applied");
  assert.equal(repository.referrals[0].status, "converted");
  assert.ok(errors.some((error) => error.operation === "StripeWebhookService.afterCommit"));
});

test("an unknown price writes no subscription and is recorded as unknown_price", async () => {
  const { service, repository, errors } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  const outcome = await service.process(subscriptionEvent({ priceId: "price_mystery" }));

  assert.equal(outcome, "unknown_price");
  assert.equal(repository.subscriptions.has("user-1"), false);
  assert.equal(errors.length, 1);
});

test("a customer nobody owns is unattributed and reported; nobody else's state moves", async () => {
  const { service, repository, errors } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  const outcome = await service.process(subscriptionEvent({ id: "evt_x", customer: "cus_stranger" }));

  assert.equal(outcome, "unattributed");
  assert.equal(repository.subscriptions.size, 0);
  assert.equal(repository.ledger.get("evt_x")?.outcome, "unattributed");
  assert.equal(errors.length, 1);
});

test("a subscription is attributed by the user reference Checkout stamped on it, and the customer is remembered", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1");

  const outcome = await service.process(
    subscriptionEvent({ customer: "cus_fresh", metadata: { userId: "user-1" } }),
  );

  assert.equal(outcome, "applied");
  assert.equal(repository.accounts.get("user-1")?.stripeCustomerId, "cus_fresh");
  assert.equal(repository.subscriptions.get("user-1")?.tier, "creator");
});

test("a user reference that names nobody is unattributed rather than a crash", async () => {
  const { service } = harness();

  const outcome = await service.process(
    subscriptionEvent({ customer: null, metadata: { userId: "missing-user" } }),
  );

  assert.equal(outcome, "unattributed");
});

test("checkout.session.completed only attributes the customer; events it does not know are ignored", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1");

  const completed = await service.process({
    id: "evt_cs",
    type: "checkout.session.completed",
    created: 1_500,
    object: { id: "cs_1", customer: "cus_1", client_reference_id: "user-1", subscription: "sub_1" },
  });
  const ignored = await service.process({
    id: "evt_other",
    type: "customer.created",
    created: 1_500,
    object: { id: "cus_1" },
  });

  assert.equal(completed, "applied");
  assert.equal(repository.accounts.get("user-1")?.stripeCustomerId, "cus_1");
  assert.equal(repository.subscriptions.size, 0, "no state is granted from a checkout return");
  assert.equal(ignored, "ignored");
});

test("customer.deleted forgets the Stripe customer so the next checkout creates a new one", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  const outcome = await service.process({
    id: "evt_del",
    type: "customer.deleted",
    created: 5_000,
    object: { id: "cus_1", object: "customer" },
  });

  assert.equal(outcome, "applied");
  assert.equal((await repository.findAccount("user-1"))?.stripeCustomerId, null);
  assert.equal(
    await service.process({ id: "evt_del2", type: "customer.deleted", created: 5_001, object: { id: "cus_unknown" } }),
    "ignored",
  );
});

test("handle refuses an unsigned body, a bad signature and an unconfigured environment", async () => {
  const { service, gateway } = harness();

  await assert.rejects(() => service.handle(undefined, "sig"), /signed webhook body/);
  await assert.rejects(() => service.handle(Buffer.from("{}"), undefined), /signed webhook body/);

  gateway.nextEvent = new Error("No signatures found matching the expected signature");
  await assert.rejects(() => service.handle(Buffer.from("{}"), "t=1,v1=bad"), /could not be verified/);

  const unconfigured = harness({ configured: false });
  await assert.rejects(() => unconfigured.service.handle(Buffer.from("{}"), "sig"), /not available/);
});

test("a verified event goes through process and answers with its outcome", async () => {
  const { service, gateway, repository } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });
  gateway.nextEvent = subscriptionEvent();

  assert.deepEqual(await service.handle(Buffer.from("{}"), "t=1,v1=ok"), {
    received: true,
    outcome: "applied",
  });
});

test("reconcile applies a Stripe-read snapshot through the same path and ledger", async () => {
  const { service, repository } = harness();
  repository.seedAccount("user-1", { stripeCustomerId: "cus_1" });

  const outcome = await service.reconcileSnapshot({
    id: "sub_1",
    customerId: "cus_1",
    status: "active",
    priceId: "price_pro",
    unitAmount: 7900,
    currency: "usd",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    canceledAt: null,
    endedAt: null,
    metadata: {},
  });

  assert.equal(outcome, "applied");
  assert.equal(repository.subscriptions.get("user-1")?.tier, "pro");
  assert.ok([...repository.ledger.keys()].some((id) => id.startsWith("reconcile_sub_1_")));
});
