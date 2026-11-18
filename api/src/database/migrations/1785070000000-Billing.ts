import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The Billing tables: the per-user Stripe identity, the stored subscription
 * state the app gates on, the webhook idempotency ledger, the founding-cohort
 * seat counter and the referral records.
 *
 * Nothing billing-related lands on `user`: Better Auth serialises that row into
 * the session cookie cache, and none of this belongs on every request.
 */
export class Billing1785070000000 implements MigrationInterface {
  name = "Billing1785070000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "billing_account" (
        "userId" text PRIMARY KEY,
        "stripeCustomerId" text,
        "referralCode" text NOT NULL,
        "isFoundingCreator" boolean NOT NULL DEFAULT false,
        "foundingLockedAmount" integer,
        "foundingLockedCurrency" text,
        "foundingGrantedAt" TIMESTAMP WITH TIME ZONE,
        "firstPaidAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_billing_account_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        -- A locked price is an amount in a currency; one without the other is
        -- not a price.
        CONSTRAINT "CHK_billing_account_locked_price"
          CHECK (("foundingLockedAmount" IS NULL) = ("foundingLockedCurrency" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_account_stripe_customer"
      ON "billing_account" ("stripeCustomerId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_account_referral_code"
      ON "billing_account" ("referralCode")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_subscription" (
        "userId" text PRIMARY KEY,
        "stripeSubscriptionId" text NOT NULL,
        "stripePriceId" text NOT NULL,
        "tier" text NOT NULL,
        "status" text NOT NULL,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "currentPeriodEnd" TIMESTAMP WITH TIME ZONE,
        "canceledAt" TIMESTAMP WITH TIME ZONE,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "lastEventCreated" bigint NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_subscription_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        -- Free is the absence of a row, never a tier a subscription carries.
        CONSTRAINT "CHK_user_subscription_tier"
          CHECK ("tier" IN ('creator', 'pro')),
        CONSTRAINT "CHK_user_subscription_status"
          CHECK ("status" IN (
            'active', 'trialing', 'past_due', 'unpaid', 'canceled',
            'incomplete', 'incomplete_expired', 'paused'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_subscription_stripe_id"
      ON "user_subscription" ("stripeSubscriptionId")
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_webhook_event" (
        "stripeEventId" text PRIMARY KEY,
        "type" text NOT NULL,
        "stripeCreated" bigint NOT NULL,
        "outcome" text NOT NULL,
        "stripeCustomerId" text,
        "userId" text,
        "detail" text,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_billing_webhook_event_outcome"
          CHECK ("outcome" IN (
            'processing', 'applied', 'ignored', 'stale', 'unattributed', 'unknown_price'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_webhook_event_user"
      ON "billing_webhook_event" ("userId", "receivedAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "founding_cohort" (
        "id" smallint PRIMARY KEY,
        "claimed" integer NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_founding_cohort_single_row" CHECK ("id" = 1),
        CONSTRAINT "CHK_founding_cohort_claimed" CHECK ("claimed" >= 0)
      )
    `);
    await queryRunner.query(`
      INSERT INTO "founding_cohort" ("id", "claimed") VALUES (1, 0)
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE "referral" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referrerUserId" text NOT NULL,
        "referredUserId" text NOT NULL,
        "referralCode" text NOT NULL,
        "status" text NOT NULL DEFAULT 'referred',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "convertedAt" TIMESTAMP WITH TIME ZONE,
        "rewardedAt" TIMESTAMP WITH TIME ZONE,
        "conversionEventId" text,
        "rewardReference" text,
        CONSTRAINT "FK_referral_referrer"
          FOREIGN KEY ("referrerUserId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_referral_referred"
          FOREIGN KEY ("referredUserId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_referral_status"
          CHECK ("status" IN ('referred', 'converted', 'rewarded')),
        CONSTRAINT "CHK_referral_not_self"
          CHECK ("referrerUserId" <> "referredUserId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_referral_referred" ON "referral" ("referredUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_referral_referrer"
      ON "referral" ("referrerUserId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "referral"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "founding_cohort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_webhook_event"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_subscription"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_account"`);
  }
}
