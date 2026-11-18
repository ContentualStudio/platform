import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { UserAttributeReader } from "../content-engine/user-attribute.reader";
import {
  openTestDataSource,
  skipWithoutDatabase,
} from "../database/testing/test-data-source";
import {
  billingConfig,
  FakeStripeGateway,
  recordingAnalytics,
  recordingErrorTracking,
  subscriptionEvent,
} from "./billing.testing";
import { BillingRepository } from "./billing.repository";
import { EntitlementService } from "./entitlement.service";
import { FoundingService } from "./founding.service";
import { ReferralService } from "./referral.service";
import { StripeWebhookService } from "./stripe-webhook.service";

// The webhook path against real Postgres: the ledger row, the subscription
// row, the founding seat and the outbox event are one transaction, and the
// cohort cap holds under concurrent purchases. Needs a disposable database:
//
//   TEST_DATABASE_URL=postgresql://.../contentual_api_test \
//     yarn workspace @contentual/api test:integration
const options = { skip: skipWithoutDatabase };

let dataSource: DataSource;

function harness(cohortCap = 200) {
  const config = billingConfig({
    offers: {
      founding: { enabled: true, appliesTo: "creator", cohortCap, priceId: "price_founding" },
      alpha: { enabled: false, discountPercent: 50, durationMonths: 3 },
      referral: { enabled: true, linkBase: "https://app.example/r" },
    },
  });
  const repository = new BillingRepository(dataSource);
  const gateway = new FakeStripeGateway();
  const { errors, tracking } = recordingErrorTracking();
  const { analytics } = recordingAnalytics();
  const dispatched: string[] = [];
  const service = new StripeWebhookService(
    dataSource,
    config,
    repository,
    new FoundingService(config, repository),
    new ReferralService(config, repository, gateway, analytics as never),
    new ContentEventEmitter(),
    { dispatch: async (id: string) => void dispatched.push(id) } as never,
    tracking as never,
    gateway,
    analytics as never,
  );

  return { service, repository, gateway, errors, dispatched, entitlements: new EntitlementService(repository) };
}

async function seedUser(id: string): Promise<void> {
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified")
     VALUES ($1, $2, $3, true)`,
    [id, id, `${id}@example.test`],
  );
}

before(async () => {
  if (skipWithoutDatabase) {
    return;
  }
  dataSource = await openTestDataSource();
});

after(async () => {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
});

beforeEach(async () => {
  if (skipWithoutDatabase) {
    return;
  }
  await dataSource.query(
    `TRUNCATE "referral", "billing_webhook_event", "user_subscription", "billing_account",
             "content_engine_events" CASCADE`,
  );
  await dataSource.query(`UPDATE "founding_cohort" SET "claimed" = 0 WHERE "id" = 1`);
  await dataSource.query(`DELETE FROM "user" WHERE "email" LIKE '%@example.test'`);
});

test("a subscription event lands its row, the ledger entry and the outbox event together", options, async () => {
  const { service, repository, entitlements, dispatched } = harness();
  await seedUser("billing-u1");
  await repository.ensureAccount("billing-u1");
  await repository.setStripeCustomerId("billing-u1", "cus_1");

  const outcome = await service.process(subscriptionEvent({ id: "evt_int_1" }));

  assert.equal(outcome, "applied");
  const stored = await repository.findSubscription("billing-u1");
  assert.equal(stored?.tier, "creator");
  assert.equal(stored?.lastEventCreated, 2_000);
  assert.equal(stored?.currentPeriodEnd?.toISOString(), "2027-01-15T08:00:00.000Z");

  const resolved = await entitlements.resolve("billing-u1");
  assert.equal(resolved.paid, true);
  assert.deepEqual(resolved.analyticsWindowsDays, [7, 30, 90]);

  const ledger = await dataSource.query(
    `SELECT "outcome", "userId" FROM "billing_webhook_event" WHERE "stripeEventId" = 'evt_int_1'`,
  );
  assert.deepEqual(ledger, [{ outcome: "applied", userId: "billing-u1" }]);

  const events = await dataSource.getRepository(ContentEngineEventEntity).find();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, eventNameTokens.subscriptionStarted);
  assert.deepEqual(events[0].payload, { userId: "billing-u1", tier: "creator", foundingCreator: false });
  assert.deepEqual(dispatched, [events[0].id]);

  // The rule evaluator reads the same facts.
  const reader = new UserAttributeReader(dataSource.manager);
  assert.equal(await reader.read("billing-u1", "subscription_tier"), "creator");
  assert.equal(await reader.read("billing-u1", "subscription_status"), "active");
});

test("a metadata user id that names nobody is recorded as unattributed", options, async () => {
  const { service } = harness();

  const outcome = await service.process(
    subscriptionEvent({ id: "evt_ghost", customer: "cus_ghost", metadata: { userId: "billing-ghost" } }),
  );

  assert.equal(outcome, "unattributed");
  const ledger = await dataSource.query(
    `SELECT "outcome" FROM "billing_webhook_event" WHERE "stripeEventId" = 'evt_ghost'`,
  );
  assert.deepEqual(ledger, [{ outcome: "unattributed" }]);
});

test("a duplicate delivery stops at the ledger and a stale one at the row", options, async () => {
  const { service, repository } = harness();
  await seedUser("billing-u2");
  await repository.ensureAccount("billing-u2");
  await repository.setStripeCustomerId("billing-u2", "cus_2");

  assert.equal(await service.process(subscriptionEvent({ id: "evt_a", customer: "cus_2", created: 5_000 })), "applied");
  assert.equal(await service.process(subscriptionEvent({ id: "evt_a", customer: "cus_2", created: 5_000 })), "duplicate");
  assert.equal(
    await service.process(subscriptionEvent({ id: "evt_b", customer: "cus_2", created: 4_000, status: "canceled" })),
    "stale",
  );

  assert.equal((await repository.findSubscription("billing-u2"))?.status, "active");
  const outbox = await dataSource.getRepository(ContentEngineEventEntity).count();
  assert.equal(outbox, 1);
});

test("a failed delivery rolls the ledger row back so Stripe's retry runs the event for real", options, async () => {
  const { service, repository } = harness();
  await seedUser("billing-u3");
  await repository.ensureAccount("billing-u3");
  await repository.setStripeCustomerId("billing-u3", "cus_3");

  // A price that does not exist in the CHECK constraint's tier set cannot be
  // stored: force the failure through an impossible status instead.
  const broken = subscriptionEvent({ id: "evt_fail", customer: "cus_3" });
  (broken.object as { status: string }).status = "active";
  const original = repository.upsertSubscription.bind(repository);
  repository.upsertSubscription = async () => {
    throw new Error("simulated write failure");
  };

  await assert.rejects(() => service.process(broken), /simulated write failure/);
  const ledger = await dataSource.query(
    `SELECT 1 FROM "billing_webhook_event" WHERE "stripeEventId" = 'evt_fail'`,
  );
  assert.equal(ledger.length, 0, "the ledger row rolled back with the failure");

  repository.upsertSubscription = original;
  assert.equal(await service.process(broken), "applied", "the retry is not mistaken for a duplicate");
});

test("concurrent founding purchases never exceed the cap", options, async () => {
  const cap = 3;
  const { service, repository } = harness(cap);
  const users = ["f1", "f2", "f3", "f4", "f5", "f6"];

  for (const id of users) {
    await seedUser(`billing-${id}`);
    await repository.ensureAccount(`billing-${id}`);
    await repository.setStripeCustomerId(`billing-${id}`, `cus_${id}`);
  }

  const outcomes = await Promise.all(
    users.map((id) =>
      service.process(
        subscriptionEvent({
          id: `evt_${id}`,
          subscriptionId: `sub_${id}`,
          customer: `cus_${id}`,
          priceId: "price_founding",
        }),
      ),
    ),
  );

  assert.deepEqual(outcomes, users.map(() => "applied"));
  assert.equal(await repository.foundingClaimed(), cap);

  const flagged = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "billing_account" WHERE "isFoundingCreator" = true`,
  );
  assert.equal(Number(flagged[0].count), cap);

  const paying = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "user_subscription" WHERE "tier" = 'creator' AND "status" = 'active'`,
  );
  assert.equal(Number(paying[0].count), users.length, "everyone still bought Creator");
});

test("a referred member's first paid month rewards the referrer through the real tables", options, async () => {
  const { service, repository, gateway } = harness();
  await seedUser("billing-ref");
  await seedUser("billing-new");
  const referrer = await repository.ensureAccount("billing-ref");
  await repository.setStripeCustomerId("billing-ref", "cus_ref");
  await repository.ensureAccount("billing-new");
  await repository.setStripeCustomerId("billing-new", "cus_new");
  assert.equal(
    await repository.insertReferral({
      referrerUserId: "billing-ref",
      referredUserId: "billing-new",
      referralCode: referrer.referralCode,
    }),
    true,
  );

  await service.process(subscriptionEvent({ id: "evt_ref", subscriptionId: "sub_ref", customer: "cus_ref" }));
  await service.process(subscriptionEvent({ id: "evt_new", subscriptionId: "sub_new", customer: "cus_new" }));

  assert.equal(gateway.credits.length, 1);
  assert.equal(gateway.credits[0].customerId, "cus_ref");
  assert.equal(gateway.credits[0].amount, 2900);
  assert.deepEqual(await repository.referralCounts("billing-ref"), { referred: 1, converted: 1, rewarded: 1 });
  // The service refuses a self-referral before any write; the CHECK is the
  // backstop for a writer that forgets, and it fails loudly rather than
  // quietly inserting.
  await assert.rejects(
    () =>
      repository.insertReferral({
        referrerUserId: "billing-new",
        referredUserId: "billing-new",
        referralCode: "x",
      }),
    /CHK_referral_not_self/,
  );
});
