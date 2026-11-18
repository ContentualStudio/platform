import { cache } from "react";
import { serverApiGet } from "@/lib/api-client";
import {
  billingCatalogueSchema,
  billingMeSchema,
  type BillingCatalogue,
  type BillingMe,
} from "@/schemas/billing.schema";

// Wrapped in React's cache() so the settings frame, the account section and
// the analytics page share one request per navigation.
export const getBillingMeServer = cache(
  async (): Promise<BillingMe | null> => serverApiGet("/billing/me", billingMeSchema),
);

/** The pricing table; null rather than an error so the page still renders. */
export const getBillingCatalogueServer = cache(
  async (): Promise<BillingCatalogue | null> =>
    serverApiGet("/billing/tiers", billingCatalogueSchema).catch(() => null),
);
