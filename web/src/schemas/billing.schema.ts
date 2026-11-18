import { z } from "zod";

// GET /billing/me, GET /billing/tiers and the Checkout / portal responses.
// Mirrors the api's Billing contract; nothing here carries a Stripe id.

export const billingTierKeySchema = z.enum(["free", "creator", "pro"]);

export type BillingTierKey = z.infer<typeof billingTierKeySchema>;

export const entitlementsSchema = z.object({
  tier: billingTierKeySchema,
  paid: z.boolean(),
  status: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.string().nullable(),
  isFoundingCreator: z.boolean(),
  hasStripeCustomer: z.boolean(),
  analyticsWindowsDays: z.array(z.number()),
});

export type Entitlements = z.infer<typeof entitlementsSchema>;

export const referralSummarySchema = z.object({
  code: z.string(),
  link: z.string(),
  enabled: z.boolean(),
  counts: z.object({
    referred: z.number(),
    converted: z.number(),
    rewarded: z.number(),
  }),
});

export type ReferralSummary = z.infer<typeof referralSummarySchema>;

export const billingMeSchema = z.object({
  entitlements: entitlementsSchema,
  referral: referralSummarySchema,
});

export type BillingMe = z.infer<typeof billingMeSchema>;

export const publicPriceSchema = z.object({
  /** Minor units, as Stripe reports them. */
  amount: z.number(),
  currency: z.string(),
  interval: z.string().nullable(),
});

export type PublicPrice = z.infer<typeof publicPriceSchema>;

export const publicTierSchema = z.object({
  key: billingTierKeySchema,
  displayName: z.string(),
  order: z.number(),
  programmeSet: z.string(),
  earlyAccess: z.boolean(),
  analytics: z.boolean(),
  analyticsWindowsDays: z.array(z.number()),
  paidLessons: z.boolean(),
  checkout: z.boolean(),
  price: publicPriceSchema.nullable(),
});

export type PublicTier = z.infer<typeof publicTierSchema>;

export const billingCatalogueSchema = z.object({
  configured: z.boolean(),
  tiers: z.array(publicTierSchema),
  offers: z.object({
    founding: z.object({
      available: z.boolean(),
      appliesTo: z.string(),
      price: publicPriceSchema.nullable(),
    }),
    alpha: z.object({
      enabled: z.boolean(),
      discountPercent: z.number(),
      durationMonths: z.number(),
    }),
  }),
});

export type BillingCatalogue = z.infer<typeof billingCatalogueSchema>;

export const hostedSessionSchema = z.object({ url: z.string().url() });

export const referralAttachResultSchema = z.object({ outcome: z.string() });

export const checkoutRequestSchema = z.object({
  tier: billingTierKeySchema.exclude(["free"]),
});

export type CheckoutTier = z.infer<typeof checkoutRequestSchema>["tier"];

/** "$29" for 2900 USD; whole units unless the amount needs the cents. */
export function formatPrice(price: PublicPrice): string {
  const units = price.amount / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(units);
}

const TIER_DISPLAY_NAMES: Record<BillingTierKey, string> = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
};

export function tierDisplayName(tier: BillingTierKey): string {
  return TIER_DISPLAY_NAMES[tier];
}

/** Set by `/r/<code>`, consumed by `ReferralCapture` after sign-in. */
export const REFERRAL_COOKIE = "contentual_ref";
