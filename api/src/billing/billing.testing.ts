import type { EntityManager } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { noopProductAnalytics } from "../observability/product-analytics.port";
import { BillingConfigService } from "./billing-config.service";
import type {
  BillingAccountRow,
  BillingRepository,
  ReferralCounts,
  SubscriptionRow,
  WebhookOutcome,
} from "./billing.repository";
import { generateReferralCode } from "./billing.repository";
import { referralStatuses, type ReferralStatus } from "./entities/referral.entity";
import {
  type CreateCheckoutSessionInput,
  type CreateCustomerInput,
  type CreatePortalSessionInput,
  type CreditCustomerBalanceInput,
  type StripeGateway,
  type StripePriceSummary,
  type StripeWebhookEvent,
  StripeCustomerMissingError,
} from "./stripe-gateway.port";
import type {
  DerivedSubscriptionState,
  StripeSubscriptionSnapshot,
} from "./subscription-state";

/**
 * Test doubles for the Billing unit tests.
 *
 * The repository is an in-memory implementation of the real one's contract,
 * not a mock of calls: the services under test are exercised for the state
 * they leave behind, which is what the webhook handler is actually judged on.
 * The gateway records what it was asked and answers deterministically.
 */

export const testUser: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

export function billingConfig(
  overrides: Record<string, unknown> = {},
): BillingConfigService {
  const values: Record<string, unknown> = {
    configured: true,
    webhookSecret: "whsec_test",
    webOrigin: "https://app.example",
    returnPath: "/settings/account",
    prices: { creator: "price_creator", pro: "price_pro" },
    offers: {
      founding: {
        enabled: true,
        appliesTo: "creator",
        cohortCap: 200,
        priceId: "price_founding",
      },
      alpha: {
        enabled: true,
        discountPercent: 50,
        durationMonths: 3,
        stripeDiscountId: "coupon_alpha",
      },
      referral: {
        enabled: true,
        linkBase: "https://app.example/r",
      },
    },
    ...overrides,
  };

  const config = {
    get: (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === "object"
              ? (node as Record<string, unknown>)[part]
              : undefined,
          { billing: values },
        ),
  };

  return new BillingConfigService(config as never);
}

interface FakeReferral {
  readonly id: string;
  readonly referrerUserId: string;
  readonly referredUserId: string;
  readonly referralCode: string;
  readonly status: ReferralStatus;
  readonly createdAt: Date;
  readonly convertedAt: Date | null;
  readonly rewardedAt: Date | null;
}

export class FakeBillingRepository {
  readonly accounts = new Map<string, BillingAccountRow>();
  readonly subscriptions = new Map<string, SubscriptionRow>();
  readonly ledger = new Map<
    string,
    { type: string; created: number; outcome: WebhookOutcome; userId?: string | null }
  >();
  readonly referrals: FakeReferral[] = [];
  claimed = 0;

  seedAccount(userId: string, overrides: Partial<BillingAccountRow> = {}): BillingAccountRow {
    const row: BillingAccountRow = {
      userId,
      stripeCustomerId: null,
      referralCode: generateReferralCode(),
      isFoundingCreator: false,
      foundingLockedAmount: null,
      foundingLockedCurrency: null,
      foundingGrantedAt: null,
      firstPaidAt: null,
      ...overrides,
    };
    this.accounts.set(userId, row);
    return row;
  }

  seedSubscription(userId: string, overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
    const row: SubscriptionRow = {
      userId,
      stripeSubscriptionId: "sub_existing",
      stripePriceId: "price_creator",
      tier: "creator",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      canceledAt: null,
      endedAt: null,
      lastEventCreated: 1_000,
      ...overrides,
    };
    this.subscriptions.set(userId, row);
    return row;
  }

  async findAccount(userId: string) {
    return this.accounts.get(userId);
  }

  async findAccountForUpdate(userId: string) {
    return this.accounts.get(userId);
  }

  async findAccountByCustomerId(customerId: string) {
    return [...this.accounts.values()].find(
      (row) => row.stripeCustomerId === customerId,
    );
  }

  async findAccountByReferralCode(code: string) {
    return [...this.accounts.values()].find((row) => row.referralCode === code);
  }

  async userExists(userId: string) {
    return !userId.startsWith("missing-");
  }

  async ensureAccount(userId: string) {
    return this.accounts.get(userId) ?? this.seedAccount(userId);
  }

  async clearStripeCustomerId(stripeCustomerId: string) {
    const row = [...this.accounts.values()].find(
      (account) => account.stripeCustomerId === stripeCustomerId,
    );
    if (row) {
      this.accounts.set(row.userId, { ...row, stripeCustomerId: null });
    }
    return row?.userId;
  }

  async setStripeCustomerId(userId: string, stripeCustomerId: string) {
    const row = this.accounts.get(userId);
    if (row && !row.stripeCustomerId) {
      this.accounts.set(userId, { ...row, stripeCustomerId });
    }
  }

  async markFirstPaid(userId: string, at: Date) {
    const row = this.accounts.get(userId);
    if (!row || row.firstPaidAt) {
      return false;
    }
    this.accounts.set(userId, { ...row, firstPaidAt: at });
    return true;
  }

  async grantFounding(
    userId: string,
    lockedPrice: { amount: number | null; currency: string | null },
    at: Date,
  ) {
    const row = this.accounts.get(userId);
    if (row) {
      this.accounts.set(userId, {
        ...row,
        isFoundingCreator: true,
        foundingLockedAmount: row.foundingLockedAmount ?? lockedPrice.amount,
        foundingLockedCurrency: row.foundingLockedCurrency ?? lockedPrice.currency,
        foundingGrantedAt: row.foundingGrantedAt ?? at,
      });
    }
  }

  async setFoundingFlag(userId: string, founding: boolean) {
    const row = this.accounts.get(userId);
    if (row) {
      this.accounts.set(userId, { ...row, isFoundingCreator: founding });
    }
  }

  async foundingClaimed() {
    return this.claimed;
  }

  async claimFoundingSeat(cap: number) {
    if (this.claimed >= cap) {
      return false;
    }
    this.claimed += 1;
    return true;
  }

  async findSubscription(userId: string) {
    return this.subscriptions.get(userId);
  }

  async findSubscriptionForUpdate(userId: string) {
    return this.subscriptions.get(userId);
  }

  async upsertSubscription(
    userId: string,
    state: DerivedSubscriptionState,
    lastEventCreated: number,
  ) {
    this.subscriptions.set(userId, { userId, ...state, lastEventCreated });
  }

  async recordWebhookEvent(event: { id: string; type: string; created: number }) {
    if (this.ledger.has(event.id)) {
      return false;
    }
    this.ledger.set(event.id, {
      type: event.type,
      created: event.created,
      outcome: "processing",
    });
    return true;
  }

  async finishWebhookEvent(
    eventId: string,
    result: { outcome: WebhookOutcome; userId?: string | null },
  ) {
    const row = this.ledger.get(eventId);
    if (row) {
      this.ledger.set(eventId, { ...row, outcome: result.outcome, userId: result.userId });
    }
  }

  async insertReferral(input: {
    referrerUserId: string;
    referredUserId: string;
    referralCode: string;
  }) {
    if (this.referrals.some((row) => row.referredUserId === input.referredUserId)) {
      return false;
    }
    this.referrals.push({
      id: `ref_${this.referrals.length + 1}`,
      ...input,
      status: referralStatuses.referred,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      convertedAt: null,
      rewardedAt: null,
    });
    return true;
  }

  async markReferralConverted(referredUserId: string, _eventId: string, at: Date) {
    const index = this.referrals.findIndex(
      (row) =>
        row.referredUserId === referredUserId &&
        row.status === referralStatuses.referred,
    );
    if (index === -1) {
      return undefined;
    }
    const row = this.referrals[index];
    this.referrals[index] = { ...row, status: referralStatuses.converted, convertedAt: at };
    return row.referrerUserId;
  }

  async nextUnrewardedReferralId(referrerUserId: string) {
    return this.referrals.find(
      (row) =>
        row.referrerUserId === referrerUserId &&
        row.status === referralStatuses.converted,
    )?.id;
  }

  async markReferralRewarded(referralId: string, _reference: string, at: Date) {
    const index = this.referrals.findIndex(
      (row) => row.id === referralId && row.status === referralStatuses.converted,
    );
    if (index === -1) {
      return false;
    }
    this.referrals[index] = {
      ...this.referrals[index],
      status: referralStatuses.rewarded,
      rewardedAt: at,
    };
    return true;
  }

  async referralCounts(referrerUserId: string): Promise<ReferralCounts> {
    const mine = this.referrals.filter((row) => row.referrerUserId === referrerUserId);
    const rewarded = mine.filter((row) => row.status === referralStatuses.rewarded).length;
    const converted =
      mine.filter((row) => row.status === referralStatuses.converted).length + rewarded;
    return { referred: mine.length, converted, rewarded };
  }

  asRepository(): BillingRepository {
    return this as unknown as BillingRepository;
  }
}

export class FakeStripeGateway implements StripeGateway {
  readonly customers: CreateCustomerInput[] = [];
  readonly checkouts: CreateCheckoutSessionInput[] = [];
  readonly portals: CreatePortalSessionInput[] = [];
  readonly credits: CreditCustomerBalanceInput[] = [];
  prices = new Map<string, StripePriceSummary>([
    ["price_creator", { id: "price_creator", unitAmount: 2900, currency: "usd", interval: "month" }],
    ["price_pro", { id: "price_pro", unitAmount: 7900, currency: "usd", interval: "month" }],
    ["price_founding", { id: "price_founding", unitAmount: 1900, currency: "usd", interval: "month" }],
  ]);
  subscriptions = new Map<string, StripeSubscriptionSnapshot>();
  nextEvent: StripeWebhookEvent | Error | undefined;
  failPrices = false;
  failCredits = false;

  async retrievePrice(priceId: string) {
    if (this.failPrices) {
      throw new Error("stripe unreachable");
    }
    return this.prices.get(priceId);
  }

  async createCustomer(input: CreateCustomerInput) {
    this.customers.push(input);
    return { id: `cus_${this.customers.length}` };
  }

  /** Customer ids Stripe answers "No such customer" for. */
  readonly deletedCustomers = new Set<string>();

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    if (this.deletedCustomers.has(input.customerId)) {
      throw new StripeCustomerMissingError(input.customerId);
    }
    this.checkouts.push(input);
    return { id: `cs_${this.checkouts.length}`, url: "https://checkout.stripe.test/cs" };
  }

  async createPortalSession(input: CreatePortalSessionInput) {
    if (this.deletedCustomers.has(input.customerId)) {
      throw new StripeCustomerMissingError(input.customerId);
    }
    this.portals.push(input);
    return { url: "https://billing.stripe.test/portal" };
  }

  async creditCustomerBalance(input: CreditCustomerBalanceInput) {
    if (this.failCredits) {
      throw new Error("credit failed");
    }
    // Stripe dedupes on the idempotency key; so does the fake.
    if (!this.credits.some((credit) => credit.idempotencyKey === input.idempotencyKey)) {
      this.credits.push(input);
    }
    return { id: `cbtxn_${this.credits.length}` };
  }

  async listCustomerSubscriptions(customerId: string) {
    return [...this.subscriptions.values()].filter(
      (snapshot) => snapshot.customerId === customerId,
    );
  }

  constructWebhookEvent(): StripeWebhookEvent {
    if (this.nextEvent instanceof Error) {
      throw this.nextEvent;
    }
    if (!this.nextEvent) {
      throw new Error("no event queued");
    }
    return this.nextEvent;
  }
}

/** A DataSource whose transaction is just the callback; the fakes need no manager. */
export const fakeDataSource = {
  transaction: async <T>(work: (manager: EntityManager) => Promise<T>) =>
    work({} as EntityManager),
};

export function recordingErrorTracking() {
  const errors: { message: string; operation: string }[] = [];

  return {
    errors,
    tracking: {
      captureException: (error: unknown, context: { operation: string }) => {
        errors.push({
          message: error instanceof Error ? error.message : String(error),
          operation: context.operation,
        });
      },
    },
  };
}

export function recordingAnalytics() {
  const events: { event: string; properties: Record<string, unknown> }[] = [];

  return {
    events,
    analytics: {
      capture: (input: { event: string; properties: Record<string, unknown> }) => {
        events.push({ event: input.event, properties: input.properties });
      },
    },
  };
}

export { noopProductAnalytics };

/** A Stripe `customer.subscription.*` event body as the webhook receives it. */
export function subscriptionEvent(
  overrides: {
    id?: string;
    type?: string;
    created?: number;
    subscriptionId?: string;
    customer?: string | null;
    status?: string;
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, string>;
  } = {},
): StripeWebhookEvent {
  return {
    id: overrides.id ?? "evt_1",
    type: overrides.type ?? "customer.subscription.created",
    created: overrides.created ?? 2_000,
    object: {
      id: overrides.subscriptionId ?? "sub_1",
      object: "subscription",
      status: overrides.status ?? "active",
      customer: overrides.customer === undefined ? "cus_1" : overrides.customer,
      cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
      canceled_at: null,
      ended_at: null,
      items: {
        data: [
          {
            price: {
              id: overrides.priceId ?? "price_creator",
              unit_amount: overrides.priceId === "price_founding" ? 1900 : 2900,
              currency: "usd",
            },
            current_period_end: 1_800_000_000,
          },
        ],
      },
      metadata: overrides.metadata ?? {},
    },
  };
}
