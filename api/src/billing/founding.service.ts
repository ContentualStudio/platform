import { Injectable } from "@nestjs/common";
import type { SqlQueryable } from "../database/queryable";
import { BillingConfigService } from "./billing-config.service";
import { BillingRepository } from "./billing.repository";
import type { TierKey } from "./billing-tiers";

export interface FoundingAvailability {
  readonly appliesTo: TierKey;
  /** True only when a purchase right now would actually be granted. */
  readonly available: boolean;
}

/**
 * Founding-creator availability and grant. A Checkout opened while a seat was
 * free can complete after the cohort fills; the webhook reports that case.
 */
@Injectable()
export class FoundingService {
  constructor(
    private readonly config: BillingConfigService,
    private readonly repository: BillingRepository,
  ) {}

  async availability(queryable?: SqlQueryable): Promise<FoundingAvailability> {
    const offer = this.config.foundingOffer();

    if (!offer.enabled || !offer.priceId || !this.config.configured) {
      return { appliesTo: offer.appliesTo, available: false };
    }

    const claimed = await this.repository.foundingClaimed(queryable);

    return { appliesTo: offer.appliesTo, available: claimed < offer.cohortCap };
  }

  /** Whether a Stripe price is the founding price. */
  isFoundingPrice(priceId: string | null | undefined): boolean {
    const founding = this.config.foundingOffer().priceId;

    return Boolean(priceId && founding && priceId === founding);
  }

  /**
   * Grants founding status inside the caller's transaction, if a seat
   * remains. Idempotent per user: an account already flagged keeps its seat
   * and takes no second one.
   */
  async grantInTransaction(
    queryable: SqlQueryable,
    input: {
      userId: string;
      lockedPrice: { amount: number | null; currency: string | null };
      at: Date;
    },
  ): Promise<"granted" | "already" | "cohort_full"> {
    const account = await this.repository.findAccountForUpdate(
      input.userId,
      queryable,
    );

    if (account?.isFoundingCreator) {
      return "already";
    }

    const claimed = await this.repository.claimFoundingSeat(
      this.config.foundingOffer().cohortCap,
      queryable,
    );

    if (!claimed) {
      return "cohort_full";
    }

    await this.repository.grantFounding(
      input.userId,
      input.lockedPrice,
      input.at,
      queryable,
    );

    return "granted";
  }
}
