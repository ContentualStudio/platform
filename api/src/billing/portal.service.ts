import { Inject, Injectable } from "@nestjs/common";
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
  noStripeCustomerError,
} from "./billing.errors";
import {
  STRIPE_GATEWAY,
  StripeCustomerMissingError,
  type StripeGateway,
} from "./stripe-gateway.port";

/**
 * "Manage subscription": a Stripe-hosted portal session for the user's own
 * customer. Payment method, plan changes and cancellation all happen there,
 * and every change comes back through the subscription webhook — the app
 * renders none of those controls itself.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly config: BillingConfigService,
    private readonly repository: BillingRepository,
    @Inject(STRIPE_GATEWAY) private readonly gateway: StripeGateway,
    @Inject(PRODUCT_ANALYTICS) private readonly analytics: ProductAnalytics,
  ) {}

  async createSession(user: AuthenticatedUser): Promise<{ url: string }> {
    if (!this.config.configured) {
      throw billingUnavailableError();
    }

    const account = await this.repository.findAccount(user.id);

    // Only ever the caller's own customer id: there is no parameter through
    // which another customer could be named.
    if (!account?.stripeCustomerId) {
      throw noStripeCustomerError();
    }

    const session = await this.gateway
      .createPortalSession({
        customerId: account.stripeCustomerId,
        returnUrl: `${this.config.webOrigin}${this.config.returnPath}?portal=return`,
        configurationId: this.config.portalConfigurationId,
      })
      .catch(async (error: unknown) => {
        // Deleted in Stripe: there is nothing left to manage.
        if (error instanceof StripeCustomerMissingError) {
          await this.repository.clearStripeCustomerId(error.customerId);
          throw noStripeCustomerError();
        }

        throw error;
      });

    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.billingPortalOpened,
      properties: {},
    });

    return { url: session.url };
  }
}
