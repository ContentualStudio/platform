import { Injectable } from "@nestjs/common";
import type { SqlQueryable } from "../database/queryable";
import { BillingRepository } from "./billing.repository";
import {
  tier,
  tierKeyOrFree,
  tierKeys,
  tierSatisfies,
  type TierKey,
} from "./billing-tiers";
import { effectiveTierFor, type SubscriptionStatus } from "./subscription-state";

/**
 * What a user is entitled to, resolved from stored subscription state.
 *
 * Plain data, so a request can resolve it once and hand it to every gate on
 * the page. The gates below are pure functions over it for the same reason:
 * the programme list, the lesson reader and the analytics graph must never
 * re-derive "is this user paid" on their own.
 */
export interface Entitlements {
  readonly tier: TierKey;
  readonly paid: boolean;
  /** The Stripe status behind `tier`, or "none" with no subscription. */
  readonly status: SubscriptionStatus | "none";
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
  readonly isFoundingCreator: boolean;
  readonly hasStripeCustomer: boolean;
  readonly analyticsWindowsDays: readonly number[];
}

export const freeEntitlements: Entitlements = Object.freeze({
  tier: tierKeys.free,
  paid: false,
  status: "none",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  isFoundingCreator: false,
  hasStripeCustomer: false,
  analyticsWindowsDays: tier(tierKeys.free).analyticsWindowsDays,
});

/** Whether content gated at `minimumTier` (CMS-authored) is open. Unknown reads as free. */
export function programmeAccessible(
  entitlements: Pick<Entitlements, "tier">,
  minimumTier: unknown,
): boolean {
  return tierSatisfies(entitlements.tier, tierKeyOrFree(minimumTier));
}

/** Lessons gate exactly like programmes. */
export const lessonAccessible = programmeAccessible;

@Injectable()
export class EntitlementService {
  constructor(private readonly repository: BillingRepository) {}

  /**
   * The single answer to "what does this user get".
   *
   * A user with no billing rows resolves to Free — never an error. The only
   * writes to what this reads are the webhook handler's, so the answer is
   * whatever Stripe last confirmed, and a scheduled cancellation stays paid
   * until the period end Stripe reported.
   */
  async resolve(
    userId: string,
    queryable?: SqlQueryable,
  ): Promise<Entitlements> {
    const [account, subscription] = await Promise.all([
      this.repository.findAccount(userId, queryable),
      this.repository.findSubscription(userId, queryable),
    ]);

    const tierKey = effectiveTierFor(subscription?.status, subscription?.tier);
    const definition = tier(tierKey);

    return {
      tier: tierKey,
      paid: tierKey !== tierKeys.free,
      status: subscription?.status ?? "none",
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      isFoundingCreator: account?.isFoundingCreator ?? false,
      hasStripeCustomer: Boolean(account?.stripeCustomerId),
      analyticsWindowsDays: definition.analyticsWindowsDays,
    };
  }
}
