import type { StripeSubscriptionSnapshot } from "./subscription-state";

/** Everything Billing asks of Stripe. Adapters normalise; raw SDK objects never cross. */

export interface StripePriceSummary {
  readonly id: string;
  /** Minor units (cents). Null for a metered or tiered price. */
  readonly unitAmount: number | null;
  readonly currency: string;
  readonly interval: "day" | "week" | "month" | "year" | null;
}

export interface CreateCustomerInput {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
}

export interface CreateCheckoutSessionInput {
  readonly customerId: string;
  readonly priceId: string;
  /** Carried on the session and the subscription so the webhook can attribute both. */
  readonly userId: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** A Stripe coupon id to apply to the session, if an offer is on. */
  readonly couponId?: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CreditCustomerBalanceInput {
  readonly customerId: string;
  /** Minor units, positive. */
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  /** Stripe idempotency key: a retry with the same key credits once. */
  readonly idempotencyKey: string;
}

export interface CreatePortalSessionInput {
  readonly customerId: string;
  readonly returnUrl: string;
  readonly configurationId?: string;
}

/** A verified webhook event, reduced to what the handler routes on. */
export interface StripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  /** Unix seconds. The out-of-order guard compares these. */
  readonly created: number;
  readonly object: unknown;
}

export interface StripeGateway {
  retrievePrice(priceId: string): Promise<StripePriceSummary | undefined>;
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<{ id: string; url: string }>;
  createPortalSession(input: CreatePortalSessionInput): Promise<{ url: string }>;
  /** Credits the customer's balance; the next invoice draws it down first. */
  creditCustomerBalance(input: CreditCustomerBalanceInput): Promise<{ id: string }>;
  listCustomerSubscriptions(
    customerId: string,
  ): Promise<StripeSubscriptionSnapshot[]>;
  /** Verifies the signature and parses the event; throws when either fails. */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): StripeWebhookEvent;
}

/** The customer id sent to Stripe no longer exists there (e.g. deleted in the dashboard). */
export class StripeCustomerMissingError extends Error {
  constructor(readonly customerId: string) {
    super(`Stripe customer ${customerId} no longer exists.`);
    this.name = "StripeCustomerMissingError";
  }
}

export const STRIPE_GATEWAY = Symbol("STRIPE_GATEWAY");
