import * as assert from "node:assert/strict";
import { test } from "node:test";
import { billingConfig, FakeBillingRepository } from "./billing.testing";
import { FoundingService } from "./founding.service";

function harness(configOverrides: Record<string, unknown> = {}) {
  const config = billingConfig(configOverrides);
  const repository = new FakeBillingRepository();

  return { service: new FoundingService(config, repository.asRepository()), repository };
}

test("the offer is available while enabled, priced, configured and below the cap", async () => {
  const { service, repository } = harness();

  assert.deepEqual(await service.availability(), {
    appliesTo: "creator",
    available: true,
  });

  repository.claimed = 200;
  assert.equal((await service.availability()).available, false);
});

test("without a founding price the offer is unavailable whatever the toggle says", async () => {
  const { service } = harness({
    offers: {
      founding: { enabled: true, appliesTo: "creator", cohortCap: 200 },
      alpha: { enabled: false, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: false, linkBase: "x" },
    },
  });

  const availability = await service.availability();
  assert.equal(availability.available, false);
  assert.equal(service.isFoundingPrice("price_founding"), false);
});

test("granting is idempotent per user and stops exactly at the cap", async () => {
  const { service, repository } = harness({
    offers: {
      founding: { enabled: true, appliesTo: "creator", cohortCap: 2, priceId: "price_founding" },
      alpha: { enabled: false, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: false, linkBase: "x" },
    },
  });
  const lockedPrice = { amount: 1900, currency: "usd" };
  const at = new Date("2026-09-11T10:00:00.000Z");
  for (const userId of ["a", "b", "c"]) {
    repository.seedAccount(userId);
  }

  assert.equal(await service.grantInTransaction({} as never, { userId: "a", lockedPrice, at }), "granted");
  assert.equal(await service.grantInTransaction({} as never, { userId: "a", lockedPrice, at }), "already");
  assert.equal(await service.grantInTransaction({} as never, { userId: "b", lockedPrice, at }), "granted");
  assert.equal(await service.grantInTransaction({} as never, { userId: "c", lockedPrice, at }), "cohort_full");
  assert.equal(repository.claimed, 2);
  assert.equal(repository.accounts.get("a")?.foundingLockedAmount, 1900);
  assert.equal(repository.accounts.get("c")?.isFoundingCreator, false);
});
