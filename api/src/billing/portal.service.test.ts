import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingConfig,
  FakeBillingRepository,
  FakeStripeGateway,
  recordingAnalytics,
  testUser,
} from "./billing.testing";
import { PortalService } from "./portal.service";

function harness() {
  const repository = new FakeBillingRepository();
  const gateway = new FakeStripeGateway();
  const { analytics } = recordingAnalytics();
  const service = new PortalService(
    billingConfig(),
    repository.asRepository(),
    gateway,
    analytics as never,
  );

  return { service, repository, gateway };
}

test("the portal opens for the member's own customer", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount(testUser.id, { stripeCustomerId: "cus_1" });

  assert.ok((await service.createSession(testUser)).url);
  assert.equal(gateway.portals[0].customerId, "cus_1");
});

test("a customer deleted in Stripe is forgotten and reported as nothing to manage", async () => {
  const { service, repository, gateway } = harness();
  repository.seedAccount(testUser.id, { stripeCustomerId: "cus_gone" });
  gateway.deletedCustomers.add("cus_gone");

  await assert.rejects(() => service.createSession(testUser), /no subscription to manage/);
  assert.equal((await repository.findAccount(testUser.id))?.stripeCustomerId, null);
});
