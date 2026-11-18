import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingConfig,
  FakeBillingRepository,
  FakeStripeGateway,
  recordingAnalytics,
  testUser,
} from "./billing.testing";
import { ReferralService } from "./referral.service";

function harness(configOverrides: Record<string, unknown> = {}) {
  const config = billingConfig(configOverrides);
  const repository = new FakeBillingRepository();
  const gateway = new FakeStripeGateway();
  const { events, analytics } = recordingAnalytics();
  const service = new ReferralService(config, repository.asRepository(), gateway, analytics as never);

  return { service, repository, gateway, events };
}

test("every member gets a stable code and a link on the configured base", async () => {
  const { service, repository } = harness();

  const first = await service.summaryFor(testUser);
  const second = await service.summaryFor(testUser);

  assert.equal(first.code, second.code);
  assert.match(first.code, /^[a-z0-9]{10}$/);
  assert.equal(first.link, `https://app.example/r/${first.code}`);
  assert.equal(first.enabled, true);
  assert.deepEqual(first.counts, { referred: 0, converted: 0, rewarded: 0 });
  assert.equal(repository.accounts.size, 1);
});

test("attaching resolves the referrer by code and refuses self, repeats, unknown codes and paid users", async () => {
  const { service, repository, events } = harness();
  const referrer = repository.seedAccount("referrer", { referralCode: "kindfriend" });

  assert.deepEqual(await service.attach(testUser, " KINDFRIEND "), { outcome: "attached" });
  assert.equal(repository.referrals[0].referrerUserId, referrer.userId);
  assert.equal(events[0].event, "referral_attached");

  assert.deepEqual(await service.attach(testUser, "kindfriend"), { outcome: "already_attributed" });
  assert.deepEqual(await service.attach(testUser, "nobody"), { outcome: "unknown_code" });
  assert.deepEqual(await service.attach(testUser, "!!!"), { outcome: "unknown_code" });
  assert.deepEqual(
    await service.attach({ ...testUser, id: "referrer" }, "kindfriend"),
    { outcome: "self_referral" },
  );

  repository.seedAccount("veteran", { firstPaidAt: new Date() });
  assert.deepEqual(
    await service.attach({ ...testUser, id: "veteran" }, "kindfriend"),
    { outcome: "already_paid" },
  );
});

test("a disabled reward credits nothing, and the summary says so", async () => {
  const { service, repository, gateway } = harness({
    offers: {
      founding: { enabled: false, appliesTo: "creator", cohortCap: 200 },
      alpha: { enabled: false, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: false, linkBase: "https://app.example/r" },
    },
  });
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r" });
  repository.seedSubscription("referrer");
  await repository.insertReferral({ referrerUserId: "referrer", referredUserId: "u", referralCode: "c" });
  await repository.markReferralConverted("u", "evt", new Date());

  assert.deepEqual(await service.applyPendingReward("referrer"), { outcome: "disabled" });
  assert.equal(gateway.credits.length, 0);
  assert.equal((await service.summaryFor({ ...testUser, id: "referrer" })).enabled, false);
});

test("counts are cumulative: a rewarded referral also counts as converted and referred", async () => {
  const { service, repository } = harness();
  repository.seedAccount("referrer", { stripeCustomerId: "cus_r" });
  repository.seedSubscription("referrer");
  for (const [referred, stage] of [["a", "referred"], ["b", "converted"], ["c", "rewarded"]] as const) {
    await repository.insertReferral({ referrerUserId: "referrer", referredUserId: referred, referralCode: "x" });
    if (stage !== "referred") {
      await repository.markReferralConverted(referred, "evt", new Date());
    }
  }
  assert.deepEqual(await service.applyPendingReward("referrer"), { outcome: "rewarded" });

  const summary = await service.summaryFor({ ...testUser, id: "referrer" });
  assert.deepEqual(summary.counts, { referred: 3, converted: 2, rewarded: 1 });
});
