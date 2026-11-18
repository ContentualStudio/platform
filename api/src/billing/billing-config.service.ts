import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  findTier,
  listTiers,
  paidTierKeys,
  tierKeys,
  type BillingTier,
  type PaidTierKey,
  type TierKey,
} from "./billing-tiers";
import type { PriceTierMap } from "./subscription-state";

/**
 * The one definition every Billing surface reads tiers and offers through.
 *
 * Nothing here reaches Stripe. This module answers "which tiers exist, what
 * do they unlock, which price id does each check out against, and are the
 * offers on" — the live price *amount* is fetched from Stripe by the surface
 * that displays it, against the id this returns.
 */

export interface FoundingOffer {
  readonly enabled: boolean;
  readonly appliesTo: TierKey;
  readonly cohortCap: number;
  /** The founding price. Unset means the offer cannot be sold, whatever the toggle says. */
  readonly priceId?: string;
}

export interface AlphaOffer {
  readonly enabled: boolean;
  readonly discountPercent: number;
  readonly durationMonths: number;
  readonly stripeDiscountId?: string;
}

export interface ReferralOffer {
  readonly enabled: boolean;
  readonly linkBase: string;
}

/**
 * A tier as a pricing page may see it.
 *
 * Deliberately narrower than `BillingTier` plus config: the Stripe price id is
 * a server fact and is not on this shape, so handing a pricing UI the tier
 * list cannot leak it. The client gets the display name, the ordering and the
 * entitlement facts it renders, and the live amount is fetched server-side.
 */
export interface PublicTier {
  readonly key: TierKey;
  readonly displayName: string;
  readonly order: number;
  readonly programmeSet: BillingTier["programmeSet"];
  readonly earlyAccess: boolean;
  readonly analytics: boolean;
  readonly analyticsWindowsDays: readonly number[];
  readonly paidLessons: boolean;
  readonly checkout: boolean;
}

@Injectable()
export class BillingConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Whether Stripe is provisioned in this environment. */
  get configured(): boolean {
    return this.config.get<boolean>("billing.configured") ?? false;
  }

  get webhookSecret(): string | undefined {
    return this.config.get<string>("billing.webhookSecret");
  }

  get webOrigin(): string {
    return this.config.get<string>("billing.webOrigin") ?? "http://localhost:3000";
  }

  get returnPath(): string {
    return this.config.get<string>("billing.returnPath") ?? "/settings/account";
  }

  get portalConfigurationId(): string | undefined {
    return this.config.get<string>("billing.portalConfigurationId");
  }

  /** Every tier, cheapest first. */
  listTiers(): readonly BillingTier[] {
    return listTiers();
  }

  /** Resolves a tier by key; undefined for anything unrecognised. */
  findTier(key: unknown): BillingTier | undefined {
    return findTier(key);
  }

  /**
   * The Stripe price id a tier checks out against.
   *
   * Undefined for Free, which has no price by design, and for a paid tier
   * whose price is not configured in this environment — the caller must treat
   * both as "cannot check out" rather than assuming a price exists.
   */
  priceIdFor(key: TierKey): string | undefined {
    return this.config.get<Partial<Record<TierKey, string>>>("billing.prices")?.[
      key
    ];
  }

  /** True when this tier can actually be purchased right now. */
  canCheckOut(key: TierKey): boolean {
    return (
      this.configured &&
      (this.findTier(key)?.checkout ?? false) &&
      Boolean(this.priceIdFor(key))
    );
  }

  /**
   * Every Stripe price this environment sells, mapped to the paid tier it
   * buys. The founding price sells the tier the founding offer applies to.
   * This is what the webhook resolves a subscription's tier through.
   */
  priceTierMap(): PriceTierMap {
    const entries: [string, PaidTierKey][] = [];

    for (const key of paidTierKeys) {
      const priceId = this.priceIdFor(key);

      if (priceId) {
        entries.push([priceId, key]);
      }
    }

    const founding = this.foundingOffer();

    if (founding.priceId && founding.appliesTo !== tierKeys.free) {
      entries.push([founding.priceId, founding.appliesTo as PaidTierKey]);
    }

    return Object.fromEntries(entries);
  }

  foundingOffer(): FoundingOffer {
    return (
      this.config.get<FoundingOffer>("billing.offers.founding") ?? {
        enabled: true,
        appliesTo: tierKeys.creator,
        cohortCap: 200,
      }
    );
  }

  /**
   * The alpha-conversion offer.
   *
   * Reported as disabled when no Stripe discount id is configured, however the
   * toggle reads: the discount is applied through that id at Checkout, so
   * without it an "enabled" offer would be advertised and then silently not
   * applied — the customer paying full price after being shown half.
   */
  alphaOffer(): AlphaOffer {
    const offer = this.config.get<AlphaOffer>("billing.offers.alpha") ?? {
      enabled: false,
      discountPercent: 50,
      durationMonths: 3,
    };

    return {
      ...offer,
      enabled: offer.enabled && Boolean(offer.stripeDiscountId),
    };
  }

  /** The referral reward: a month's credit on the referrer's Stripe balance. */
  referralOffer(): ReferralOffer {
    return (
      this.config.get<ReferralOffer>("billing.offers.referral") ?? {
        enabled: false,
        linkBase: `${this.webOrigin}/r`,
      }
    );
  }


  /** The tier list a pricing UI may receive, with no price ids on it. */
  publicTiers(): readonly PublicTier[] {
    return this.listTiers().map((entry) => ({
      key: entry.key,
      displayName: entry.displayName,
      order: entry.order,
      programmeSet: entry.programmeSet,
      earlyAccess: entry.earlyAccess,
      analytics: entry.analytics,
      analyticsWindowsDays: entry.analyticsWindowsDays,
      paidLessons: entry.paidLessons,
      checkout: entry.checkout,
    }));
  }
}
