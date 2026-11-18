// Billing settings that differ per environment: the Stripe price id behind
// each paid tier, and the launch offers.
//
// No price *amount* appears here or anywhere else in the codebase. A tier
// carries the id of a Stripe price, and the live amount is whatever Stripe
// reports for it — so a reprice is a change in Stripe plus an env var, never a
// deploy, and the app can never disagree with what a customer is charged.
//
// Every value is optional. With no Stripe account provisioned the tiers still
// resolve and `configured` reads false, which keeps local dev and the test
// suites working without credentials — the same shape instagram.config.ts uses.

import { tierKeys, type TierKey } from "../billing/billing-tiers";
import { parseBoolean, parsePositiveInt, readOptional } from "./env";

/** The tiers that check out. Free has no price by definition, not by omission. */
const PAID_TIERS = [tierKeys.creator, tierKeys.pro] as const;

type PaidTier = (typeof PAID_TIERS)[number];

const PRICE_ENV_VARS: Readonly<Record<PaidTier, string>> = {
  [tierKeys.creator]: "STRIPE_PRICE_CREATOR",
  [tierKeys.pro]: "STRIPE_PRICE_PRO",
};

function priceIds(): Readonly<Partial<Record<TierKey, string>>> {
  const entries = PAID_TIERS.map(
    (key) => [key, readOptional(process.env[PRICE_ENV_VARS[key]])] as const,
  ).filter((entry): entry is readonly [PaidTier, string] => Boolean(entry[1]));

  return Object.fromEntries(entries);
}

export default () => {
  const prices = priceIds();
  const webOrigin = (
    readOptional(process.env.WEB_ORIGIN) ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const foundingPriceId = readOptional(process.env.STRIPE_PRICE_CREATOR_FOUNDING);

  return {
    billing: {
      secretKey: readOptional(process.env.STRIPE_SECRET_KEY),
      webhookSecret: readOptional(process.env.STRIPE_WEBHOOK_SECRET),
      /**
       * The single flag the rest of Billing reads to decide whether it is
       * talking to Stripe or standing down. A secret key with no configured
       * price would let checkout start and then fail at Stripe, so both are
       * required before this reads true.
       */
      configured:
        Boolean(readOptional(process.env.STRIPE_SECRET_KEY)) &&
        Object.keys(prices).length > 0,
      prices,
      // Where Checkout and the customer portal send the browser back to. The
      // web origin is the one auth already trusts; the path is the Account
      // section of settings, which owns the subscription surface.
      webOrigin,
      returnPath:
        readOptional(process.env.BILLING_RETURN_PATH) ?? "/settings/account",
      // Optional: a specific portal configuration. Unset uses the account's
      // default portal configuration, which is where plan switching and
      // cancel-at-period-end are turned on.
      portalConfigurationId: readOptional(
        process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      ),
      offers: {
        // The founding-creator lock: a rate held for the first cohort.
        founding: {
          enabled: parseBoolean(process.env.BILLING_FOUNDING_OFFER_ENABLED, true),
          appliesTo: tierKeys.creator as TierKey,
          cohortCap: parsePositiveInt(process.env.BILLING_FOUNDING_COHORT_CAP, 200),
          // The Stripe price a founding purchase checks out against instead of
          // the tier's normal price. Without it the offer reports unavailable
          // however the toggle reads: there would be nothing to sell at.
          priceId: foundingPriceId,
        },
        // Alpha testers converting to a paid plan: 3 months at 50% off,
        // applied through a Stripe coupon or promotion code at Checkout.
        alpha: {
          enabled: parseBoolean(process.env.BILLING_ALPHA_OFFER_ENABLED, true),
          discountPercent: parsePositiveInt(
            process.env.BILLING_ALPHA_DISCOUNT_PERCENT,
            50,
          ),
          durationMonths: parsePositiveInt(
            process.env.BILLING_ALPHA_DISCOUNT_MONTHS,
            3,
          ),
          // Without this the discount cannot be applied, so the offer is off
          // however the toggle reads — see BillingConfigService.alphaOffer.
          stripeDiscountId: readOptional(process.env.STRIPE_ALPHA_COUPON_ID),
        },
        // A referred user's first paid month earns the referrer one month's
        // price as a credit on their Stripe customer balance.
        referral: {
          enabled: parseBoolean(process.env.BILLING_REFERRAL_ENABLED, true),
          linkBase: (
            readOptional(process.env.BILLING_REFERRAL_LINK_BASE) ??
            `${webOrigin}/r`
          ).replace(/\/$/, ""),
        },
      },
    },
  };
};
