import * as assert from "node:assert/strict";
import { test } from "node:test";
import { billingConfig, FakeBillingRepository, FakeStripeGateway } from "./billing.testing";
import { FoundingService } from "./founding.service";
import { PriceCatalogueService } from "./price-catalogue.service";

function harness(configOverrides: Record<string, unknown> = {}) {
  const config = billingConfig(configOverrides);
  const repository = new FakeBillingRepository();
  const gateway = new FakeStripeGateway();
  gateway.prices.set("price_creator", { id: "price_creator", unitAmount: 2900, currency: "usd", interval: "month" });
  gateway.prices.set("price_pro", { id: "price_pro", unitAmount: 7900, currency: "usd", interval: "month" });
  gateway.prices.set("price_founding", { id: "price_founding", unitAmount: 1900, currency: "usd", interval: "month" });
  const service = new PriceCatalogueService(config, new FoundingService(config, repository.asRepository()), gateway);

  return { service, gateway, repository };
}

test("the catalogue carries live amounts, no price ids, and the founding price while seats remain", async () => {
  const { service } = harness();

  const catalogue = await service.catalogue();

  assert.deepEqual(
    catalogue.tiers.map((tier) => [tier.key, tier.price?.amount ?? null, tier.checkout]),
    [["free", null, false], ["creator", 2900, true], ["pro", 7900, true]],
  );
  assert.equal(JSON.stringify(catalogue).includes("price_"), false, "no Stripe id reaches the client");
  assert.deepEqual(catalogue.offers.founding, { available: true, appliesTo: "creator", price: { amount: 1900, currency: "usd", interval: "month" } });
  assert.equal(catalogue.offers.alpha.enabled, true);
});

test("a paid tier with no configured price is left off the table entirely", async () => {
  const { service } = harness({ prices: { creator: "price_creator" } });

  const catalogue = await service.catalogue();

  assert.deepEqual(catalogue.tiers.map((tier) => tier.key), ["free", "creator"]);
});

test("prices are cached, and a Stripe outage degrades to an unavailable amount rather than an error", async () => {
  const { service, gateway } = harness();

  await service.catalogue();
  gateway.failPrices = true;
  const cached = await service.catalogue();
  assert.equal(cached.tiers[1].price?.amount, 2900, "served from the cache");

  const cold = harness();
  cold.gateway.failPrices = true;
  const degraded = await cold.service.catalogue();
  assert.equal(degraded.tiers[1].price, null);
  assert.equal(degraded.tiers[1].key, "creator");
});

test("concurrent catalogue reads share one Stripe request per price", async () => {
  const { service, gateway } = harness();
  let calls = 0;
  const retrieve = gateway.retrievePrice.bind(gateway);
  gateway.retrievePrice = async (priceId) => {
    calls += 1;
    return retrieve(priceId);
  };

  await Promise.all([service.catalogue(), service.catalogue(), service.catalogue()]);

  assert.equal(calls, 3, "creator, pro and founding, each fetched once");
});
