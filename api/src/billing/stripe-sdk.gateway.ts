import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
// The package is `module.exports = Stripe` with an `export =` declaration.
// Without esModuleInterop a default import compiles to `.default`, which is
// undefined at runtime, and a namespace import cannot name a class. The
// import-equals form is the one that is correct under CommonJS emit.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require("stripe");
import {
  StripeCustomerMissingError,
  type CreateCheckoutSessionInput,
  type CreateCustomerInput,
  type CreatePortalSessionInput,
  type CreditCustomerBalanceInput,
  type StripeGateway,
  type StripePriceSummary,
  type StripeWebhookEvent,
} from "./stripe-gateway.port";
import {
  normalizeStripeSubscription,
  type StripeSubscriptionSnapshot,
} from "./subscription-state";

/** Translates Stripe's "No such customer" into the port's typed error. */
function rethrowMissingCustomer(error: unknown, customerId: string): never {
  const stripeError = error as { code?: string; param?: string };

  if (
    stripeError?.code === "resource_missing" &&
    stripeError.param === "customer"
  ) {
    throw new StripeCustomerMissingError(customerId);
  }

  throw error;
}

const PRICE_INTERVALS = ["day", "week", "month", "year"] as const;

function interval(value: unknown): StripePriceSummary["interval"] {
  return (PRICE_INTERVALS as readonly string[]).includes(String(value))
    ? (value as StripePriceSummary["interval"])
    : null;
}

/** Stripe SDK adapter; the client is created lazily from the secret key. */
@Injectable()
export class StripeSdkGateway implements StripeGateway {
  private client: Stripe | undefined;

  constructor(private readonly config: ConfigService) {}

  private get stripe(): Stripe {
    if (!this.client) {
      const secretKey = this.config.get<string>("billing.secretKey");

      if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured.");
      }

      this.client = new Stripe(secretKey, {
        appInfo: { name: "Contentual", url: "https://contentual.ai" },
        // Pricing reads sit on page loads; fail fast rather than the SDK's 80s.
        timeout: 10_000,
        maxNetworkRetries: 2,
      });
    }

    return this.client;
  }

  async retrievePrice(
    priceId: string,
  ): Promise<StripePriceSummary | undefined> {
    const price = await this.stripe.prices.retrieve(priceId);

    return {
      id: price.id,
      unitAmount: price.unit_amount ?? null,
      currency: price.currency,
      interval: interval(price.recurring?.interval),
    };
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: { userId: input.userId },
    });

    return { id: customer.id };
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<{ id: string; url: string }> {
    const session = await this.stripe.checkout.sessions
      .create({
        mode: "subscription",
        customer: input.customerId,
        client_reference_id: input.userId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { ...input.metadata, userId: input.userId },
        subscription_data: {
          metadata: { ...input.metadata, userId: input.userId },
        },
        ...(input.couponId ? { discounts: [{ coupon: input.couponId }] } : {}),
      })
      .catch((error: unknown) =>
        rethrowMissingCustomer(error, input.customerId),
      );

    if (!session.url) {
      throw new Error("Stripe Checkout returned a session without a url.");
    }

    return { id: session.id, url: session.url };
  }

  async createPortalSession(
    input: CreatePortalSessionInput,
  ): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions
      .create({
        customer: input.customerId,
        return_url: input.returnUrl,
        ...(input.configurationId
          ? { configuration: input.configurationId }
          : {}),
      })
      .catch((error: unknown) =>
        rethrowMissingCustomer(error, input.customerId),
      );

    return { url: session.url };
  }

  async creditCustomerBalance(
    input: CreditCustomerBalanceInput,
  ): Promise<{ id: string }> {
    // A negative balance transaction is a credit applied to future invoices.
    const transaction = await this.stripe.customers.createBalanceTransaction(
      input.customerId,
      {
        amount: -input.amount,
        currency: input.currency,
        description: input.description,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    return { id: transaction.id };
  }

  async listCustomerSubscriptions(
    customerId: string,
  ): Promise<StripeSubscriptionSnapshot[]> {
    const page = await this.stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    return page.data
      .map(normalizeStripeSubscription)
      .filter(
        (snapshot): snapshot is StripeSubscriptionSnapshot =>
          snapshot !== undefined,
      );
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): StripeWebhookEvent {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    );

    return {
      id: event.id,
      type: event.type,
      created: event.created,
      object: event.data.object,
    };
  }
}
