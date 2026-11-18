import "../database/data-source";
// See stripe-sdk.gateway.ts for why this is an import-equals.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require("stripe");

/**
 * Provisions the Stripe objects Billing is configured with, idempotently, and
 * prints the environment variables that point at them.
 *
 *   yarn workspace @contentual/api stripe:bootstrap
 *   yarn workspace @contentual/api stripe:bootstrap -- --creator 2900 --pro 7900 --founding 1900
 *
 * Amounts are minor units. The defaults are the Developer Brief v6 figures
 * (Creator $29, Pro $79, founding $19) and are placeholders until the client
 * confirms pricing: the app never reads an amount from anywhere but Stripe,
 * so re-running with new amounts — or editing the prices in the dashboard —
 * is the whole reprice.
 *
 * Prices are found again by lookup key and coupons by id, so running this
 * twice creates nothing twice. Changing an amount creates a *new* price under
 * the same product and retires the lookup key onto it, which is how Stripe
 * prices work: existing subscribers stay on the price they bought.
 */

interface Options {
  creator: number;
  pro: number;
  founding: number;
  currency: string;
}

const LOOKUP_KEYS = {
  creator: "contentual_creator_monthly",
  pro: "contentual_pro_monthly",
  founding: "contentual_creator_founding_monthly",
} as const;

const COUPON_IDS = {
  alpha: "contentual-alpha-50-off-3-months",
} as const;

function parseOptions(argv: readonly string[]): Options {
  const value = (flag: string, fallback: string): string => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : (argv[index + 1] ?? fallback);
  };
  const amount = (flag: string, fallback: number): number => {
    const parsed = Number(value(flag, String(fallback)));
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${flag} must be a positive integer amount in minor units.`);
    }
    return parsed;
  };

  return {
    creator: amount("--creator", 2900),
    pro: amount("--pro", 7900),
    founding: amount("--founding", 1900),
    currency: value("--currency", "usd").toLowerCase(),
  };
}

async function ensureProduct(
  stripe: Stripe,
  tier: string,
  name: string,
): Promise<Stripe.Product> {
  const found = await stripe.products.search({
    query: `active:'true' AND metadata['contentual_tier']:'${tier}'`,
    limit: 1,
  });

  if (found.data[0]) {
    return found.data[0];
  }

  return stripe.products.create({ name, metadata: { contentual_tier: tier } });
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  lookupKey: string,
  unitAmount: number,
  currency: string,
  nickname: string,
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const current = existing.data[0];

  if (
    current &&
    current.unit_amount === unitAmount &&
    current.currency === currency &&
    current.recurring?.interval === "month"
  ) {
    return current;
  }

  // A different amount is a new price; the lookup key moves to it. The old
  // price is left active so existing subscriptions keep billing on it.
  return stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: unitAmount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname,
  });
}

async function ensureCoupon(
  stripe: Stripe,
  id: string,
  params: Stripe.CouponCreateParams,
): Promise<Stripe.Coupon> {
  try {
    return await stripe.coupons.retrieve(id);
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") {
      throw error;
    }
  }

  return stripe.coupons.create({ id, ...params });
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set (see api/.env.example).");
  }

  const options = parseOptions(process.argv.slice(2));
  const stripe = new Stripe(secretKey, {
    appInfo: { name: "Contentual bootstrap" },
  });

  const creator = await ensureProduct(stripe, "creator", "Contentual Creator");
  const pro = await ensureProduct(stripe, "pro", "Contentual Pro");

  const creatorPrice = await ensurePrice(
    stripe,
    creator,
    LOOKUP_KEYS.creator,
    options.creator,
    options.currency,
    "Creator monthly",
  );
  const foundingPrice = await ensurePrice(
    stripe,
    creator,
    LOOKUP_KEYS.founding,
    options.founding,
    options.currency,
    "Creator monthly — founding creator rate",
  );
  const proPrice = await ensurePrice(
    stripe,
    pro,
    LOOKUP_KEYS.pro,
    options.pro,
    options.currency,
    "Pro monthly",
  );

  const alpha = await ensureCoupon(stripe, COUPON_IDS.alpha, {
    name: "Alpha creators: 50% off for 3 months",
    percent_off: 50,
    duration: "repeating",
    duration_in_months: 3,
  });

  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";

  console.log(`# Stripe ${mode} mode — paste into the api environment`);
  console.log(`STRIPE_PRICE_CREATOR=${creatorPrice.id}`);
  console.log(`STRIPE_PRICE_PRO=${proPrice.id}`);
  console.log(`STRIPE_PRICE_CREATOR_FOUNDING=${foundingPrice.id}`);
  console.log(`STRIPE_ALPHA_COUPON_ID=${alpha.id}`);
  console.log(
    `# Webhook endpoint to register: https://<api-host>/billing/stripe/webhook`,
  );
  console.log(
    `# Events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, customer.deleted`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
