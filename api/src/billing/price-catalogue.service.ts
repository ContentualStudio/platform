import { Inject, Injectable, Logger } from "@nestjs/common";
import { BillingConfigService, type PublicTier } from "./billing-config.service";
import { tierKeys } from "./billing-tiers";
import { FoundingService } from "./founding.service";
import {
  STRIPE_GATEWAY,
  type StripeGateway,
  type StripePriceSummary,
} from "./stripe-gateway.port";

export interface PublicPrice {
  /** Minor units. */
  readonly amount: number;
  readonly currency: string;
  readonly interval: StripePriceSummary["interval"];
}

export interface PublicTierWithPrice extends PublicTier {
  /** Null while prices are unavailable, or for Free. */
  readonly price: PublicPrice | null;
}

export interface PublicBillingCatalogue {
  readonly configured: boolean;
  readonly tiers: readonly PublicTierWithPrice[];
  readonly offers: {
    readonly founding: {
      readonly available: boolean;
      readonly appliesTo: string;
      readonly price: PublicPrice | null;
    };
    readonly alpha: {
      readonly enabled: boolean;
      readonly discountPercent: number;
      readonly durationMonths: number;
    };
  };
}

const PRICE_CACHE_MS = 5 * 60_000;
const PRICE_RETRY_MS = 30_000;

/**
 * Tiers from config, amounts from Stripe (cached briefly). A paid tier with no
 * configured price is omitted.
 */
@Injectable()
export class PriceCatalogueService {
  private readonly logger = new Logger(PriceCatalogueService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; price: Promise<StripePriceSummary | undefined> }
  >();

  constructor(
    private readonly config: BillingConfigService,
    private readonly founding: FoundingService,
    @Inject(STRIPE_GATEWAY) private readonly gateway: StripeGateway,
  ) {}

  async catalogue(): Promise<PublicBillingCatalogue> {
    const pricedTiers = Promise.all(
      this.config.publicTiers().map(async (entry): Promise<PublicTierWithPrice | null> => {
        if (entry.key === tierKeys.free) {
          return { ...entry, price: null };
        }

        const priceId = this.config.priceIdFor(entry.key);

        return priceId
          ? {
              ...entry,
              checkout: this.config.canCheckOut(entry.key),
              price: toPublicPrice(await this.price(priceId)),
            }
          : null;
      }),
    );
    const [tierResults, founding] = await Promise.all([
      pricedTiers,
      this.founding.availability(),
    ]);
    const tiers = tierResults.filter((entry) => entry !== null);
    const foundingPriceId = this.config.foundingOffer().priceId;
    const alpha = this.config.alphaOffer();

    return {
      configured: this.config.configured,
      tiers,
      offers: {
        founding: {
          available: founding.available,
          appliesTo: founding.appliesTo,
          price:
            founding.available && foundingPriceId
              ? toPublicPrice(await this.price(foundingPriceId))
              : null,
        },
        alpha: {
          enabled: alpha.enabled,
          discountPercent: alpha.discountPercent,
          durationMonths: alpha.durationMonths,
        },
      },
    };
  }

  /**
   * Concurrent readers share one Stripe request. On failure the previous
   * amount (if any) is served and retried after a short back-off, so an
   * outage does not make every page load wait on Stripe.
   */
  private price(priceId: string): Promise<StripePriceSummary | undefined> {
    const cached = this.cache.get(priceId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.price;
    }

    const price = this.gateway.retrievePrice(priceId).catch(async (error) => {
      this.logger.warn(
        `Could not read Stripe price ${priceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.cache.set(priceId, { expiresAt: Date.now() + PRICE_RETRY_MS, price });

      return cached ? cached.price : undefined;
    });

    this.cache.set(priceId, { expiresAt: Date.now() + PRICE_CACHE_MS, price });

    return price;
  }

}

function toPublicPrice(price: StripePriceSummary | undefined): PublicPrice | null {
  if (!price || price.unitAmount === null) {
    return null;
  }

  return {
    amount: price.unitAmount,
    currency: price.currency,
    interval: price.interval,
  };
}
