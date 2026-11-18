import { apiFetch } from "@/lib/api-client";
import {
  billingMeSchema,
  checkoutRequestSchema,
  hostedSessionSchema,
  referralAttachResultSchema,
  type BillingMe,
  type CheckoutTier,
} from "@/schemas/billing.schema";

export class BillingServiceError extends Error {
  constructor(
    message: string,
    readonly code = "BILLING_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "BillingServiceError";
  }
}

function failure(rawPayload: unknown, fallback: string): BillingServiceError {
  const payload = rawPayload as { code?: string; message?: string };

  return new BillingServiceError(payload.message ?? fallback, payload.code);
}

/** Starts Stripe Checkout for a paid plan; the caller navigates to `url`. */
export async function startCheckout(tier: CheckoutTier): Promise<{ url: string }> {
  const body = checkoutRequestSchema.parse({ tier });
  const { response, rawPayload } = await apiFetch("/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw failure(rawPayload, "We couldn't start the checkout. Try again.");
  }

  return hostedSessionSchema.parse(rawPayload);
}

/** Opens the Stripe customer portal; the caller navigates to `url`. */
export async function openBillingPortal(): Promise<{ url: string }> {
  const { response, rawPayload } = await apiFetch("/billing/portal", {
    method: "POST",
  });

  if (!response.ok) {
    throw failure(rawPayload, "We couldn't open your billing portal. Try again.");
  }

  return hostedSessionSchema.parse(rawPayload);
}

/** The signed-in user's billing state, for polling after Checkout returns. */
export async function fetchBillingMe(): Promise<BillingMe> {
  const { response, rawPayload } = await apiFetch("/billing/me", {
    method: "GET",
  });

  if (!response.ok) {
    throw failure(rawPayload, "We couldn't load your plan.");
  }

  return billingMeSchema.parse(rawPayload);
}

export async function attachReferral(code: string): Promise<{ outcome: string }> {
  const { response, rawPayload } = await apiFetch("/billing/referral/attach", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw failure(rawPayload, "We couldn't record the referral.");
  }

  return referralAttachResultSchema.parse(rawPayload);
}
