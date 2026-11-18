import { z } from "zod";
import {
  parsePaidTierKey,
  tierKeys,
  type PaidTierKey,
  type TierKey,
} from "./billing-tiers";

/** Pure derivations over subscription state, shared by webhook, entitlements and rules. */

/** Stripe's subscription statuses, as the webhook reports them. */
export const subscriptionStatuses = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/**
 * The statuses that keep a paid tier's entitlement.
 *
 * `past_due` is deliberately paid: Stripe is still retrying the card, and
 * dropping a creator to Free on the first failed attempt would punish a bank
 * hiccup mid-programme. The subscription becomes `unpaid` or `canceled` when
 * Stripe gives up, and that is when entitlement follows.
 */
export const paidSubscriptionStatuses: readonly SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
];

export function parseSubscriptionStatus(
  value: unknown,
): SubscriptionStatus | undefined {
  return typeof value === "string" &&
    (subscriptionStatuses as readonly string[]).includes(value)
    ? (value as SubscriptionStatus)
    : undefined;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  return (
    typeof status === "string" &&
    (paidSubscriptionStatuses as readonly string[]).includes(status)
  );
}

/**
 * The tier a stored status and tier pair actually entitles. A cancelled or
 * lapsed subscription still carries the tier it had, which is useful history;
 * what it buys today is Free.
 */
export function effectiveTierFor(
  status: string | null | undefined,
  tierValue: string | null | undefined,
): TierKey {
  const paidTier = parsePaidTierKey(tierValue);

  return paidTier && isPaidStatus(status) ? paidTier : tierKeys.free;
}

/** Which paid tier each configured Stripe price sells. */
export type PriceTierMap = Readonly<Record<string, PaidTierKey>>;

/** The subset of a Stripe subscription Billing stores or reacts to. */
export interface StripeSubscriptionSnapshot {
  readonly id: string;
  readonly customerId: string | null;
  readonly status: SubscriptionStatus;
  readonly priceId: string | null;
  /** Minor units, as Stripe reports them; the founding lock stores this. */
  readonly unitAmount: number | null;
  readonly currency: string | null;
  readonly cancelAtPeriodEnd: boolean;
  /** Unix seconds, as Stripe reports them. */
  readonly currentPeriodEnd: number | null;
  readonly canceledAt: number | null;
  readonly endedAt: number | null;
  readonly metadata: Readonly<Record<string, string>>;
}

const expandableRef = z.union([
  z.string(),
  z.object({ id: z.string() }),
  z.null(),
]);

// Loose on purpose: Stripe adds fields freely, and a webhook must not start
// failing because a new key appeared. Only what Billing reads is named.
const subscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  customer: expandableRef.optional(),
  cancel_at_period_end: z.boolean().optional(),
  canceled_at: z.number().nullable().optional(),
  ended_at: z.number().nullable().optional(),
  // Present on API versions before 2025-03-31; later versions carry it per
  // item instead. Both are read so the SDK's pinned version cannot break this.
  current_period_end: z.number().nullable().optional(),
  items: z
    .object({
      data: z.array(
        z.object({
          price: z
            .object({
              id: z.string(),
              unit_amount: z.number().nullable().optional(),
              currency: z.string().optional(),
            })
            .optional(),
          current_period_end: z.number().nullable().optional(),
        }),
      ),
    })
    .optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
});

function refId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  return value?.id ?? null;
}

/**
 * Normalises a Stripe subscription object — from a webhook payload or an API
 * read — into the snapshot Billing works with. Undefined when the object is
 * not a subscription Billing can interpret, which the caller records rather
 * than guesses at.
 */
export function normalizeStripeSubscription(
  value: unknown,
): StripeSubscriptionSnapshot | undefined {
  const parsed = subscriptionSchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  const status = parseSubscriptionStatus(parsed.data.status);

  if (!status) {
    return undefined;
  }

  const item = parsed.data.items?.data[0];

  return {
    id: parsed.data.id,
    customerId: refId(parsed.data.customer),
    status,
    priceId: item?.price?.id ?? null,
    unitAmount: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? null,
    cancelAtPeriodEnd: parsed.data.cancel_at_period_end ?? false,
    currentPeriodEnd:
      item?.current_period_end ?? parsed.data.current_period_end ?? null,
    canceledAt: parsed.data.canceled_at ?? null,
    endedAt: parsed.data.ended_at ?? null,
    metadata: parsed.data.metadata ?? {},
  };
}

export interface StripeCheckoutSessionSnapshot {
  readonly id: string;
  readonly customerId: string | null;
  readonly clientReferenceId: string | null;
  readonly subscriptionId: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  customer: expandableRef.optional(),
  client_reference_id: z.string().nullable().optional(),
  subscription: expandableRef.optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
});

export function normalizeStripeCheckoutSession(
  value: unknown,
): StripeCheckoutSessionSnapshot | undefined {
  const parsed = checkoutSessionSchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return {
    id: parsed.data.id,
    customerId: refId(parsed.data.customer),
    clientReferenceId: parsed.data.client_reference_id ?? null,
    subscriptionId: refId(parsed.data.subscription),
    metadata: parsed.data.metadata ?? {},
  };
}

export interface StripeInvoiceSnapshot {
  readonly id: string;
  readonly customerId: string | null;
  readonly subscriptionId: string | null;
}

const invoiceSchema = z.object({
  id: z.string().min(1),
  customer: expandableRef.optional(),
  // Pre-2025-03-31 API versions carry `subscription`; later ones nest it
  // under `parent.subscription_details`. Both are read.
  subscription: expandableRef.optional(),
  parent: z
    .object({
      subscription_details: z
        .object({
          subscription: expandableRef.optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export function normalizeStripeInvoice(
  value: unknown,
): StripeInvoiceSnapshot | undefined {
  const parsed = invoiceSchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return {
    id: parsed.data.id,
    customerId: refId(parsed.data.customer),
    subscriptionId:
      refId(parsed.data.subscription) ??
      refId(parsed.data.parent?.subscription_details?.subscription),
  };
}

/** The stored state a subscription snapshot resolves to. */
export interface DerivedSubscriptionState {
  readonly stripeSubscriptionId: string;
  readonly stripePriceId: string;
  readonly tier: PaidTierKey;
  readonly status: SubscriptionStatus;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: Date | null;
  readonly canceledAt: Date | null;
  readonly endedAt: Date | null;
}

function dateFromUnix(seconds: number | null): Date | null {
  return seconds === null ? null : new Date(seconds * 1000);
}

/**
 * Maps a snapshot onto stored state. Undefined when the subscription's price
 * is not one this environment sells — the row is not written, because a tier
 * guessed from an unknown price is exactly the confident wrong answer the
 * entitlement service must never hand out.
 */
export function deriveSubscriptionState(
  snapshot: StripeSubscriptionSnapshot,
  priceTiers: PriceTierMap,
): DerivedSubscriptionState | undefined {
  const tierValue = snapshot.priceId ? priceTiers[snapshot.priceId] : undefined;

  if (!snapshot.priceId || !tierValue) {
    return undefined;
  }

  return {
    stripeSubscriptionId: snapshot.id,
    stripePriceId: snapshot.priceId,
    tier: tierValue,
    status: snapshot.status,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodEnd: dateFromUnix(snapshot.currentPeriodEnd),
    canceledAt: dateFromUnix(snapshot.canceledAt),
    endedAt: dateFromUnix(snapshot.endedAt),
  };
}
