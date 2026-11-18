import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { AppModule } from "../app.module";
import { BillingConfigService } from "../billing/billing-config.service";
import { BillingRepository } from "../billing/billing.repository";
import { STRIPE_GATEWAY, type StripeGateway } from "../billing/stripe-gateway.port";
import { StripeWebhookService } from "../billing/stripe-webhook.service";
import { isPaidStatus } from "../billing/subscription-state";

/**
 * Pulls a user's subscription from Stripe and applies it through the same
 * path a webhook takes.
 *
 *   yarn workspace @contentual/api billing:reconcile -- --email creator@example.com
 *   yarn workspace @contentual/api billing:reconcile -- --all
 *
 * For local development, where Stripe cannot reach the api, and for recovery
 * after a webhook outage. It never decides access on its own: the stored
 * state moves only through StripeWebhookService, and the ledger records the
 * reconcile as an event like any other.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1]?.trim().toLowerCase();
  const all = argv.includes("--all");

  if (!email && !all) {
    console.error("Usage: billing:reconcile -- (--email <address> | --all)");
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const gateway = app.get<StripeGateway>(STRIPE_GATEWAY);
    const webhooks = app.get(StripeWebhookService);
    const repository = app.get(BillingRepository);
    const dataSource = app.get(DataSource);

    if (!app.get(BillingConfigService).configured) {
      throw new Error("Stripe is not configured (STRIPE_SECRET_KEY and a price id are required).");
    }

    const rows = (await dataSource.query(
      email
        ? `SELECT "user"."id", "user"."email", "account"."stripeCustomerId"
             FROM "user"
             JOIN "billing_account" AS "account" ON "account"."userId" = "user"."id"
            WHERE "user"."email" = $1`
        : `SELECT "user"."id", "user"."email", "account"."stripeCustomerId"
             FROM "user"
             JOIN "billing_account" AS "account" ON "account"."userId" = "user"."id"
            WHERE "account"."stripeCustomerId" IS NOT NULL`,
      email ? [email] : [],
    )) as { id: string; email: string; stripeCustomerId: string | null }[];

    if (rows.length === 0) {
      console.log(email ? `No billing account for ${email}.` : "No Stripe customers on record.");
      return;
    }

    for (const row of rows) {
      if (!row.stripeCustomerId) {
        console.log(`${row.email}: no Stripe customer yet, nothing to reconcile.`);
        continue;
      }

      const subscriptions = await gateway.listCustomerSubscriptions(row.stripeCustomerId);
      // Prefer the subscription that is paying; otherwise the first one Stripe
      // returns, which is the most recent.
      const chosen =
        subscriptions.find((candidate) => isPaidStatus(candidate.status)) ??
        subscriptions[0];

      if (!chosen) {
        console.log(`${row.email}: no subscriptions at Stripe.`);
        continue;
      }

      const outcome = await webhooks.reconcileSnapshot(chosen);
      const stored = await repository.findSubscription(row.id);
      console.log(
        `${row.email}: ${chosen.id} (${chosen.status}) -> ${outcome}; stored tier ${stored?.tier ?? "free"} / ${stored?.status ?? "none"}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
