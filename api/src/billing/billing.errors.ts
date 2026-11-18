import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";

/** Stripe is not provisioned in this environment. */
export function billingUnavailableError() {
  return new ServiceUnavailableException({
    code: "BILLING_UNAVAILABLE",
    message: "Billing is not available right now.",
  });
}

export function tierNotPurchasableError() {
  return new BadRequestException({
    code: "TIER_NOT_PURCHASABLE",
    message: "That plan cannot be purchased right now.",
  });
}

export function subscriptionActiveError() {
  return new ConflictException({
    code: "SUBSCRIPTION_ACTIVE",
    message:
      "You already have an active subscription. Manage it from your billing portal.",
  });
}

export function noStripeCustomerError() {
  return new BadRequestException({
    code: "NO_STRIPE_CUSTOMER",
    message: "There is no subscription to manage yet.",
  });
}

export function webhookRejectedError(code: string, message: string) {
  return new BadRequestException({ code, message });
}
