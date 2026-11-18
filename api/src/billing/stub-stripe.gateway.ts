import { Injectable } from "@nestjs/common";
import { billingUnavailableError } from "./billing.errors";
import type {
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  CreatePortalSessionInput,
  CreditCustomerBalanceInput,
  StripeGateway,
  StripePriceSummary,
  StripeWebhookEvent,
} from "./stripe-gateway.port";
import type { StripeSubscriptionSnapshot } from "./subscription-state";

/** Bound when Stripe is not configured: reads are empty, mutations throw 503. */
@Injectable()
export class StubStripeGateway implements StripeGateway {
  async retrievePrice(_priceId: string): Promise<StripePriceSummary | undefined> {
    return undefined;
  }

  async createCustomer(_input: CreateCustomerInput): Promise<{ id: string }> {
    throw billingUnavailableError();
  }

  async createCheckoutSession(
    _input: CreateCheckoutSessionInput,
  ): Promise<{ id: string; url: string }> {
    throw billingUnavailableError();
  }

  async createPortalSession(
    _input: CreatePortalSessionInput,
  ): Promise<{ url: string }> {
    throw billingUnavailableError();
  }

  async creditCustomerBalance(
    _input: CreditCustomerBalanceInput,
  ): Promise<{ id: string }> {
    throw billingUnavailableError();
  }

  async listCustomerSubscriptions(
    _customerId: string,
  ): Promise<StripeSubscriptionSnapshot[]> {
    return [];
  }

  constructWebhookEvent(
    _rawBody: Buffer,
    _signature: string,
    _secret: string,
  ): StripeWebhookEvent {
    throw billingUnavailableError();
  }
}
