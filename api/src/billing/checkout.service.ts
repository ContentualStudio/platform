import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { productEventTokens } from "../observability/product-events";
import { BillingConfigService } from "./billing-config.service";
import { BillingRepository } from "./billing.repository";
import {
  billingUnavailableError,
  subscriptionActiveError,
  tierNotPurchasableError,
} from "./billing.errors";
import { type PaidTierKey } from "./billing-tiers";
import { EntitlementService } from "./entitlement.service";
import { FoundingService } from "./founding.service";
import {
  STRIPE_GATEWAY,
  StripeCustomerMissingError,
  type StripeGateway,
} from "./stripe-gateway.port";

/**
 * Starts a Stripe Checkout for a paid tier.
 *
 * Checkout only starts the subscription; nothing here grants access. The
 * subscription state — and with it every entitlement — is written by the
 * webhook when Stripe confirms the payment, which is why the return url
 * lands on a "confirming" state rather than an unlocked one.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: BillingConfigService,
    private readonly repository: BillingRepository,
    private readonly entitlements: EntitlementService,
    private readonly founding: FoundingService,
    @Inject(STRIPE_GATEWAY) private readonly gateway: StripeGateway,
    @Inject(PRODUCT_ANALYTICS) private readonly analytics: ProductAnalytics,
  ) {}

  async start(
    user: AuthenticatedUser,
    tierKey: PaidTierKey,
  ): Promise<{ url: string }> {
    if (!this.config.configured) {
      throw billingUnavailableError();
    }

    const normalPriceId = this.config.priceIdFor(tierKey);

    if (!this.config.canCheckOut(tierKey) || !normalPriceId) {
      throw tierNotPurchasableError();
    }

    const [current, founding] = await Promise.all([
      this.entitlements.resolve(user.id),
      this.founding.availability(),
    ]);

    // A second subscription for a paying user is a double charge, not an
    // upgrade. Plan changes go through the portal, which Stripe prorates.
    if (current.paid) {
      throw subscriptionActiveError();
    }

    const customerId = await this.ensureCustomer(user);

    // Founding wins over alpha: the two never stack. The founding lock is a
    // different price; the alpha discount is a coupon on the normal price.
    const foundingPriceId =
      founding.available && founding.appliesTo === tierKey
        ? this.config.foundingOffer().priceId
        : undefined;
    const foundingApplies = Boolean(foundingPriceId);
    const priceId = foundingPriceId ?? normalPriceId;
    const alpha = this.config.alphaOffer();
    const couponId =
      !foundingApplies && alpha.enabled ? alpha.stripeDiscountId : undefined;

    const returnUrl = `${this.config.webOrigin}${this.config.returnPath}`;
    const openSession = (id: string) =>
      this.gateway.createCheckoutSession({
        customerId: id,
        priceId,
        userId: user.id,
        successUrl: `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${returnUrl}?checkout=cancelled`,
        couponId,
        metadata: {
          tier: tierKey,
          founding: foundingApplies ? "true" : "false",
          alpha: couponId ? "true" : "false",
        },
      });

    const session = await openSession(customerId).catch(
      async (error: unknown) => {
        // The stored customer was deleted in Stripe: forget it and start over
        // with a fresh one, once.
        if (!(error instanceof StripeCustomerMissingError)) {
          throw error;
        }

        await this.repository.clearStripeCustomerId(error.customerId);

        return openSession(await this.ensureCustomer(user));
      },
    );

    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.checkoutStarted,
      properties: {
        tier: tierKey,
        founding: foundingApplies,
        alpha: Boolean(couponId),
      },
    });

    return { url: session.url };
  }

  /**
   * The user's Stripe customer, created on first purchase and reused after.
   *
   * The account row is locked while the customer is created so two concurrent
   * checkouts cannot mint two customers for one user — a duplicate customer
   * is exactly the kind of thing the webhook can no longer attribute.
   */
  private async ensureCustomer(user: AuthenticatedUser): Promise<string> {
    await this.repository.ensureAccount(user.id);

    return this.dataSource.transaction(async (manager) => {
      const account = await this.repository.findAccountForUpdate(
        user.id,
        manager,
      );

      if (account?.stripeCustomerId) {
        return account.stripeCustomerId;
      }

      const customer = await this.gateway.createCustomer({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      await this.repository.setStripeCustomerId(user.id, customer.id, manager);

      return customer.id;
    });
  }
}
