import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { BillingAccountRow, SubscriptionRow } from "./billing.repository";
import {
  EntitlementService,
  freeEntitlements,
  lessonAccessible,
  programmeAccessible,
} from "./entitlement.service";

function account(overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
  return {
    userId: "user-1",
    stripeCustomerId: "cus_1",
    referralCode: "abcd1234",
    isFoundingCreator: false,
    foundingLockedAmount: null,
    foundingLockedCurrency: null,
    foundingGrantedAt: null,
    firstPaidAt: null,
    ...overrides,
  };
}

function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    userId: "user-1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_creator",
    tier: "creator",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2027-01-15T08:00:00.000Z"),
    canceledAt: null,
    endedAt: null,
    lastEventCreated: 1,
    ...overrides,
  };
}

function service(rows: {
  account?: BillingAccountRow;
  subscription?: SubscriptionRow;
}) {
  return new EntitlementService({
    findAccount: async () => rows.account,
    findSubscription: async () => rows.subscription,
  } as never);
}

test("a user with no billing rows is Free, with no customer and no founding status", async () => {
  const entitlements = await service({}).resolve("user-1");

  assert.deepEqual(entitlements, freeEntitlements);
  assert.deepEqual(entitlements.analyticsWindowsDays, [7, 30]);
});

test("an active subscription entitles its tier, the 90-day window and paid lessons", async () => {
  const entitlements = await service({
    account: account({ isFoundingCreator: true }),
    subscription: subscription(),
  }).resolve("user-1");

  assert.equal(entitlements.tier, "creator");
  assert.equal(entitlements.paid, true);
  assert.equal(entitlements.status, "active");
  assert.equal(entitlements.isFoundingCreator, true);
  assert.equal(entitlements.hasStripeCustomer, true);
  assert.deepEqual(entitlements.analyticsWindowsDays, [7, 30, 90]);
  assert.equal(entitlements.currentPeriodEnd, "2027-01-15T08:00:00.000Z");
});

test("a scheduled cancellation stays paid until the period end Stripe reported", async () => {
  const entitlements = await service({
    subscription: subscription({ cancelAtPeriodEnd: true }),
  }).resolve("user-1");

  assert.equal(entitlements.paid, true);
  assert.equal(entitlements.cancelAtPeriodEnd, true);
});

test("past_due keeps the tier while Stripe retries; unpaid and canceled do not", async () => {
  assert.equal(
    (await service({ subscription: subscription({ status: "past_due" }) }).resolve("user-1")).tier,
    "creator",
  );
  assert.equal(
    (await service({ subscription: subscription({ status: "unpaid" }) }).resolve("user-1")).tier,
    "free",
  );
  const canceled = await service({
    account: account(),
    subscription: subscription({ status: "canceled" }),
  }).resolve("user-1");
  assert.equal(canceled.tier, "free");
  assert.equal(canceled.status, "canceled", "the status still says why");
  assert.equal(canceled.hasStripeCustomer, true, "the portal stays reachable");
});

test("programme, lesson and analytics gates are pure functions of the entitlements", () => {
  const free = freeEntitlements;
  const creator = { ...freeEntitlements, tier: "creator" as const, paid: true, analyticsWindowsDays: [7, 30, 90] };
  const pro = { ...creator, tier: "pro" as const };

  assert.equal(programmeAccessible(free, "free"), true);
  assert.equal(programmeAccessible(free, undefined), true, "unauthored gate is open");
  assert.equal(programmeAccessible(free, "nonsense"), true, "unknown gate is open");
  assert.equal(programmeAccessible(free, "creator"), false);
  assert.equal(programmeAccessible(creator, "creator"), true);
  assert.equal(programmeAccessible(creator, "pro"), false);
  assert.equal(programmeAccessible(pro, "creator"), true, "a higher plan opens a lower gate");

  assert.equal(lessonAccessible(free, "free"), true);
  assert.equal(lessonAccessible(free, "creator"), false);
  assert.equal(lessonAccessible(creator, "creator"), true);
  assert.equal(lessonAccessible(creator, "pro"), false, "a lesson can require Pro");
});
