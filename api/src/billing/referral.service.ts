import { Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { productEventTokens } from "../observability/product-events";
import { BillingConfigService } from "./billing-config.service";
import { BillingRepository, type ReferralCounts } from "./billing.repository";
import { STRIPE_GATEWAY, type StripeGateway } from "./stripe-gateway.port";
import { isPaidStatus } from "./subscription-state";

export interface ReferralSummary {
  readonly code: string;
  readonly link: string;
  readonly enabled: boolean;
  readonly counts: ReferralCounts;
}

export type ReferralAttachOutcome =
  | "attached"
  | "already_attributed"
  | "unknown_code"
  | "self_referral"
  | "already_paid";

export type ReferralRewardOutcome =
  | "rewarded"
  | "nothing_pending"
  | "referrer_not_paid"
  | "disabled";

const CODE_PATTERN = /^[a-z0-9]{4,32}$/;

/**
 * Referral links and the free-month reward.
 *
 * Captured at signup, converted on the referred user's first confirmed paid
 * month, rewarded as one month of the referrer's own price credited to their
 * Stripe balance. Credits leave existing discounts alone. A referrer who is not
 * paying keeps the reward banked until their next paid invoice.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly config: BillingConfigService,
    private readonly repository: BillingRepository,
    @Inject(STRIPE_GATEWAY) private readonly gateway: StripeGateway,
    @Inject(PRODUCT_ANALYTICS) private readonly analytics: ProductAnalytics,
  ) {}

  async summaryFor(user: AuthenticatedUser): Promise<ReferralSummary> {
    const account = await this.repository.ensureAccount(user.id);
    const offer = this.config.referralOffer();

    return {
      code: account.referralCode,
      link: `${offer.linkBase}/${account.referralCode}`,
      enabled: offer.enabled,
      counts: await this.repository.referralCounts(user.id),
    };
  }

  /**
   * Attributes the signed-in user to the referrer behind `code`.
   *
   * Idempotent and fail-soft: every refusal is an answer, not an error, because
   * the caller is a page load that must render either way. A user who already
   * paid cannot be attributed after the fact — the reward is for bringing in
   * a new paying member, and the first paid transition is what triggers it.
   */
  async attach(
    user: AuthenticatedUser,
    rawCode: string,
  ): Promise<{ outcome: ReferralAttachOutcome }> {
    const code = rawCode.trim().toLowerCase();

    if (!CODE_PATTERN.test(code)) {
      return { outcome: "unknown_code" };
    }

    const referrer = await this.repository.findAccountByReferralCode(code);

    if (!referrer) {
      return { outcome: "unknown_code" };
    }

    if (referrer.userId === user.id) {
      return { outcome: "self_referral" };
    }

    const own = await this.repository.ensureAccount(user.id);

    if (own.firstPaidAt) {
      return { outcome: "already_paid" };
    }

    const inserted = await this.repository.insertReferral({
      referrerUserId: referrer.userId,
      referredUserId: user.id,
      referralCode: code,
    });

    if (!inserted) {
      return { outcome: "already_attributed" };
    }

    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.referralAttached,
      properties: { referrerUserId: referrer.userId },
    });

    return { outcome: "attached" };
  }

  /**
   * Applies the referrer's oldest pending reward, if they are paying.
   *
   * Runs after the webhook transaction commits because it calls Stripe. The
   * idempotency key is the referral id, so a retry or a concurrent worker
   * credits once; a failure leaves the referral `converted` for the next
   * paid invoice to retry.
   */
  async applyPendingReward(
    referrerUserId: string,
  ): Promise<{ outcome: ReferralRewardOutcome }> {
    if (!this.config.referralOffer().enabled) {
      return { outcome: "disabled" };
    }

    const pendingId = await this.repository.nextUnrewardedReferralId(referrerUserId);

    if (!pendingId) {
      return { outcome: "nothing_pending" };
    }

    const [account, subscription] = await Promise.all([
      this.repository.findAccount(referrerUserId),
      this.repository.findSubscription(referrerUserId),
    ]);

    if (!account?.stripeCustomerId || !subscription || !isPaidStatus(subscription.status)) {
      return { outcome: "referrer_not_paid" };
    }

    const price = await this.gateway.retrievePrice(subscription.stripePriceId);

    if (!price?.unitAmount) {
      throw new Error(
        `Referral ${pendingId}: price ${subscription.stripePriceId} has no amount to credit.`,
      );
    }

    const credit = await this.gateway.creditCustomerBalance({
      customerId: account.stripeCustomerId,
      amount: price.unitAmount,
      currency: price.currency,
      description: "Referral reward: one month free",
      idempotencyKey: `referral-reward-${pendingId}`,
    });

    await this.repository.markReferralRewarded(
      pendingId,
      `${account.stripeCustomerId}:${credit.id}`,
      new Date(),
    );

    return { outcome: "rewarded" };
  }

}
