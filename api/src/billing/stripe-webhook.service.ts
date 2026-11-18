import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import {
  ContentEventBatch,
  dispatchAfterCommit,
} from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { PostHogErrorTracking } from "../observability/error-tracking.service";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { productEventTokens } from "../observability/product-events";
import { BillingConfigService } from "./billing-config.service";
import { BillingRepository, type WebhookOutcome } from "./billing.repository";
import { billingUnavailableError, webhookRejectedError } from "./billing.errors";
import { tierKeys, type TierKey } from "./billing-tiers";
import { FoundingService } from "./founding.service";
import { ReferralService } from "./referral.service";
import {
  STRIPE_GATEWAY,
  type StripeGateway,
  type StripeWebhookEvent,
} from "./stripe-gateway.port";
import {
  deriveSubscriptionState,
  effectiveTierFor,
  isPaidStatus,
  normalizeStripeCheckoutSession,
  normalizeStripeInvoice,
  normalizeStripeSubscription,
  type StripeSubscriptionSnapshot,
} from "./subscription-state";

interface WebhookResult {
  readonly outcome: WebhookOutcome;
  readonly userId?: string | null;
  readonly stripeCustomerId?: string | null;
  readonly detail?: string | null;
}

export type ProcessedOutcome = WebhookOutcome | "duplicate";

type AfterCommit = () => Promise<unknown>;

/**
 * The only writer of subscription state. Each event is one transaction
 * (ledger, subscription, founding, referral, outbox); duplicates stop at the
 * ledger and stale events at the row. Stripe calls run after commit.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: BillingConfigService,
    private readonly repository: BillingRepository,
    private readonly founding: FoundingService,
    private readonly referral: ReferralService,
    private readonly emitter: ContentEventEmitter,
    private readonly dispatcher: ContentEventDispatcher,
    private readonly errorTracking: PostHogErrorTracking,
    @Inject(STRIPE_GATEWAY) private readonly gateway: StripeGateway,
    @Inject(PRODUCT_ANALYTICS) private readonly analytics: ProductAnalytics,
  ) {}

  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true; outcome: ProcessedOutcome }> {
    const secret = this.config.webhookSecret;

    if (!this.config.configured || !secret) {
      throw billingUnavailableError();
    }

    if (!rawBody || !signature) {
      throw webhookRejectedError(
        "WEBHOOK_SIGNATURE_MISSING",
        "A signed webhook body is required.",
      );
    }

    let event: StripeWebhookEvent;

    try {
      event = this.gateway.constructWebhookEvent(rawBody, signature, secret);
    } catch (error) {
      this.errorTracking.captureException(error, {
        operation: "StripeWebhookService.handle",
      });
      throw webhookRejectedError(
        "WEBHOOK_SIGNATURE_INVALID",
        "The webhook signature could not be verified.",
      );
    }

    return { received: true, outcome: await this.process(event) };
  }

  /** Applies one verified event. Exposed for tests. */
  async process(event: StripeWebhookEvent): Promise<ProcessedOutcome> {
    return this.run(event, (manager, batch, afterCommit) =>
      this.route(manager, event, batch, afterCommit),
    );
  }

  /**
   * Applies a subscription read from the Stripe API through the webhook path,
   * recorded on the ledger under a synthetic event. For the reconcile script.
   */
  async reconcileSnapshot(
    snapshot: StripeSubscriptionSnapshot,
  ): Promise<ProcessedOutcome> {
    const created = Math.floor(Date.now() / 1000);
    const event = {
      id: `reconcile_${snapshot.id}_${created}`,
      type: "customer.subscription.updated",
      created,
      object: null,
    };

    return this.run(event, (manager, batch, afterCommit) =>
      this.applySnapshot(manager, event, snapshot, batch, afterCommit),
    );
  }

  private async run(
    event: StripeWebhookEvent,
    apply: (
      manager: EntityManager,
      batch: ContentEventBatch,
      afterCommit: AfterCommit[],
    ) => Promise<WebhookResult>,
  ): Promise<ProcessedOutcome> {
    const batch = new ContentEventBatch();
    const afterCommit: AfterCommit[] = [];

    const outcome = await this.dataSource.transaction(async (manager) => {
      const fresh = await this.repository.recordWebhookEvent(event, manager);

      if (!fresh) {
        return "duplicate" as const;
      }

      const result = await apply(manager, batch, afterCommit);
      await this.repository.finishWebhookEvent(event.id, result, manager);

      return result.outcome;
    });

    if (outcome === "duplicate") {
      return outcome;
    }

    await dispatchAfterCommit(this.dispatcher, this.logger, batch.eventIds);

    for (const task of afterCommit) {
      try {
        await task();
      } catch (error) {
        this.logger.error(
          `Post-commit billing task failed for ${event.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        this.errorTracking.captureException(error, {
          operation: "StripeWebhookService.afterCommit",
        });
      }
    }

    return outcome;
  }

  private async route(
    manager: EntityManager,
    event: StripeWebhookEvent,
    batch: ContentEventBatch,
    afterCommit: AfterCommit[],
  ): Promise<WebhookResult> {
    switch (event.type) {
      case "checkout.session.completed":
        return this.applyCheckoutCompleted(manager, event);
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const snapshot = normalizeStripeSubscription(event.object);

        return snapshot
          ? this.applySnapshot(manager, event, snapshot, batch, afterCommit)
          : { outcome: "ignored", detail: "unreadable subscription" };
      }
      case "invoice.paid":
        return this.applyInvoicePaid(manager, event, afterCommit);
      case "customer.deleted":
        return this.applyCustomerDeleted(manager, event);
      default:
        return { outcome: "ignored" };
    }
  }

  private async applyCheckoutCompleted(
    manager: EntityManager,
    event: StripeWebhookEvent,
  ): Promise<WebhookResult> {
    const session = normalizeStripeCheckoutSession(event.object);

    if (!session) {
      return { outcome: "ignored", detail: "unreadable checkout session" };
    }

    const userId = await this.resolveUser(
      manager,
      session.customerId,
      session.clientReferenceId ?? session.metadata.userId,
    );

    if (!userId) {
      this.reportUnattributed(event, session.customerId);
      return { outcome: "unattributed", stripeCustomerId: session.customerId };
    }

    // Attribution only. The subscription's own events carry the state; this
    // is here so a customer created outside our checkout path still lands on
    // the account before those events arrive.
    return { outcome: "applied", userId, stripeCustomerId: session.customerId };
  }

  /** A customer deleted in Stripe is forgotten, so the next checkout creates a new one. */
  private async applyCustomerDeleted(
    manager: EntityManager,
    event: StripeWebhookEvent,
  ): Promise<WebhookResult> {
    const customerId = (event.object as { id?: unknown } | null)?.id;

    if (typeof customerId !== "string") {
      return { outcome: "ignored", detail: "unreadable customer" };
    }

    const userId = await this.repository.clearStripeCustomerId(customerId, manager);

    return userId
      ? { outcome: "applied", userId, stripeCustomerId: customerId }
      : { outcome: "ignored", stripeCustomerId: customerId, detail: "customer not on record" };
  }

  private async applyInvoicePaid(
    manager: EntityManager,
    event: StripeWebhookEvent,
    afterCommit: AfterCommit[],
  ): Promise<WebhookResult> {
    const invoice = normalizeStripeInvoice(event.object);

    if (!invoice?.customerId) {
      return { outcome: "ignored", detail: "invoice without customer" };
    }

    const userId = await this.resolveUser(manager, invoice.customerId, undefined);

    if (!userId) {
      this.reportUnattributed(event, invoice.customerId);
      return { outcome: "unattributed", stripeCustomerId: invoice.customerId };
    }

    // A paid invoice is the moment a banked referral reward can be applied:
    // the referrer is demonstrably paying and their next invoice is the one
    // the coupon lands on.
    afterCommit.push(() => this.referral.applyPendingReward(userId));

    return { outcome: "applied", userId, stripeCustomerId: invoice.customerId };
  }

  private async applySnapshot(
    manager: EntityManager,
    event: StripeWebhookEvent,
    snapshot: StripeSubscriptionSnapshot,
    batch: ContentEventBatch,
    afterCommit: AfterCommit[],
  ): Promise<WebhookResult> {
    const userId = await this.resolveUser(
      manager,
      snapshot.customerId,
      snapshot.metadata.userId,
    );

    if (!userId) {
      this.reportUnattributed(event, snapshot.customerId);
      return { outcome: "unattributed", stripeCustomerId: snapshot.customerId };
    }

    const derived = deriveSubscriptionState(snapshot, this.config.priceTierMap());

    if (!derived) {
      this.errorTracking.captureException(
        new Error(
          `Stripe subscription ${snapshot.id} carries price ${snapshot.priceId ?? "(none)"}, which no tier is configured to sell.`,
        ),
        { operation: "StripeWebhookService.applySnapshot", userId },
      );
      return {
        outcome: "unknown_price",
        userId,
        stripeCustomerId: snapshot.customerId,
        detail: snapshot.priceId,
      };
    }

    const previous = await this.repository.findSubscriptionForUpdate(userId, manager);

    if (previous) {
      if (previous.stripeSubscriptionId === derived.stripeSubscriptionId) {
        if (event.created < previous.lastEventCreated) {
          return {
            outcome: "stale",
            userId,
            stripeCustomerId: snapshot.customerId,
            detail: `event ${event.created} < stored ${previous.lastEventCreated}`,
          };
        }
      } else if (isPaidStatus(previous.status) && !isPaidStatus(derived.status)) {
        // The tail end of an old subscription arriving while a newer one is
        // live. Overwriting would drop a paying user to Free.
        return {
          outcome: "stale",
          userId,
          stripeCustomerId: snapshot.customerId,
          detail: `${derived.stripeSubscriptionId} is not the live subscription ${previous.stripeSubscriptionId}`,
        };
      }
    }

    await this.repository.upsertSubscription(userId, derived, event.created, manager);

    const previousTier = effectiveTierFor(previous?.status, previous?.tier);
    const nextTier = effectiveTierFor(derived.status, derived.tier);
    const at = new Date(event.created * 1000);

    if (previousTier === tierKeys.free && nextTier !== tierKeys.free) {
      await this.onPaidTransition(manager, event, {
        userId,
        snapshot,
        priceId: derived.stripePriceId,
        tier: nextTier,
        at,
        batch,
        afterCommit,
      });
    } else if (
      previousTier !== tierKeys.free &&
      nextTier !== tierKeys.free &&
      previousTier !== nextTier
    ) {
      await this.emit(manager, batch, {
        eventId: contentEventIds.subscriptionChanged({
          userId,
          stripeEventId: event.id,
        }),
        eventName: eventNameTokens.subscriptionChanged,
        payload: { userId, tier: nextTier, previousTier },
      });
    } else if (previousTier !== tierKeys.free && nextTier === tierKeys.free) {
      await this.emit(manager, batch, {
        eventId: contentEventIds.subscriptionEnded({
          userId,
          stripeEventId: event.id,
        }),
        eventName: eventNameTokens.subscriptionEnded,
        payload: { userId, previousTier },
      });
    }

    return { outcome: "applied", userId, stripeCustomerId: snapshot.customerId };
  }

  /**
   * Everything that hangs off "this user is now paying": the once-only first
   * paid marker, the founding grant, the referral conversion, and the
   * `subscription.started` event the content team can author rules against.
   */
  private async onPaidTransition(
    manager: EntityManager,
    event: StripeWebhookEvent,
    input: {
      userId: string;
      snapshot: StripeSubscriptionSnapshot;
      priceId: string;
      tier: TierKey;
      at: Date;
      batch: ContentEventBatch;
      afterCommit: AfterCommit[];
    },
  ): Promise<void> {
    const { userId, snapshot, at, batch, afterCommit } = input;
    const firstPaid = await this.repository.markFirstPaid(userId, at, manager);
    let foundingCreator = false;

    if (this.founding.isFoundingPrice(input.priceId)) {
      const grant = await this.founding.grantInTransaction(manager, {
        userId,
        lockedPrice: { amount: snapshot.unitAmount, currency: snapshot.currency },
        at,
      });

      if (grant !== "cohort_full") {
        foundingCreator = true;
      } else {
        // Charged at the founding price by a Checkout session opened while a
        // seat was free. Never silent: the team decides whether to honour it.
        this.errorTracking.captureException(
          new Error(
            `Founding cohort is full but ${snapshot.id} was purchased at the founding price.`,
          ),
          { operation: "StripeWebhookService.onPaidTransition", userId },
        );
        this.analytics.capture({
          identity: { userId },
          event: productEventTokens.foundingCohortFull,
          properties: { subscriptionId: snapshot.id },
        });
      }
    } else {
      const account = await this.repository.findAccount(userId, manager);
      foundingCreator = account?.isFoundingCreator ?? false;
    }

    if (firstPaid) {
      const referrerUserId = await this.repository.markReferralConverted(
        userId,
        event.id,
        at,
        manager,
      );

      if (referrerUserId) {
        afterCommit.push(() => this.referral.applyPendingReward(referrerUserId));
      }
    }

    // The new subscriber may themselves be a referrer with banked rewards.
    afterCommit.push(() => this.referral.applyPendingReward(userId));

    await this.emit(manager, batch, {
      eventId: contentEventIds.subscriptionStarted({
        userId,
        stripeEventId: event.id,
      }),
      eventName: eventNameTokens.subscriptionStarted,
      payload: { userId, tier: input.tier, foundingCreator },
    });
  }

  private async emit(
    manager: EntityManager,
    batch: ContentEventBatch,
    input: Parameters<ContentEventEmitter["emit"]>[1],
  ): Promise<void> {
    const emitted = await this.emitter.emit(manager, input);
    batch.add(emitted.id);
  }

  /**
   * The user behind a Stripe object: by customer id first, then by the user
   * reference our own Checkout stamped on it. A metadata-only match also
   * records the customer id, so the next event resolves the fast way.
   */
  private async resolveUser(
    manager: EntityManager,
    customerId: string | null,
    metadataUserId: string | undefined,
  ): Promise<string | undefined> {
    if (customerId) {
      const account = await this.repository.findAccountByCustomerId(
        customerId,
        manager,
      );

      if (account) {
        return account.userId;
      }
    }

    if (!metadataUserId) {
      return undefined;
    }

    // Checked up front rather than caught: a failed insert would abort the
    // transaction and take the ledger write down with it.
    if (!(await this.repository.userExists(metadataUserId, manager))) {
      return undefined;
    }

    const account = await this.repository.ensureAccount(metadataUserId, manager);

    if (customerId && !account.stripeCustomerId) {
      await this.repository.setStripeCustomerId(metadataUserId, customerId, manager);
    }

    return account.userId;
  }

  private reportUnattributed(
    event: StripeWebhookEvent,
    customerId: string | null,
  ): void {
    this.errorTracking.captureException(
      new Error(
        `Stripe event ${event.id} (${event.type}) could not be attributed to a user` +
          (customerId ? ` (customer ${customerId})` : ""),
      ),
      { operation: "StripeWebhookService.resolveUser" },
    );
  }
}
