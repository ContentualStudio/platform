import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  effectTypeTokens,
  type EffectType,
} from "@contentual/content-engine-vocabulary";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../../observability/product-analytics.port";
import type {
  ContentEngineEffectDispatcher,
  EffectDispatchInput,
} from "../effect-dispatcher.port";
import { FiringLedgerService } from "../firing-ledger.service";
import type {
  ContentEngineEffectHandler,
  EffectWriteOutcome,
} from "./effect-handler";
import { EffectParameterError } from "./effect-parameters";
import {
  AwardBadgeHandler,
  InAppMessageHandler,
  PromptCallHandler,
  SuggestProgrammeHandler,
  UnlockProgrammeHandler,
} from "./effect-handlers";

/**
 * Routes a fresh reservation to the handler for its effect type.
 *
 * The handler's write and the ledger completion share one transaction. That is
 * the whole reason this class exists rather than each handler managing itself:
 * an effect that committed while its fired-mark failed would be re-run by the
 * next holder of the lease, and the user would get the badge twice.
 *
 * `grant_call` has no handler by design. It is rejected at author time, so a
 * rule carrying it in the mirror is a rule that should not exist — it is
 * reported and never executed rather than being given a quiet no-op.
 */
@Injectable()
export class ContentEngineEffectRouter implements ContentEngineEffectDispatcher {
  private readonly handlers: Partial<
    Record<EffectType, ContentEngineEffectHandler>
  >;

  private readonly logger = new Logger(ContentEngineEffectRouter.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ledger: FiringLedgerService,
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics,
    suggestProgramme: SuggestProgrammeHandler,
    unlockProgramme: UnlockProgrammeHandler,
    promptCall: PromptCallHandler,
    awardBadge: AwardBadgeHandler,
    inAppMessage: InAppMessageHandler,
  ) {
    this.handlers = {
      [effectTypeTokens.suggestProgramme]: suggestProgramme,
      [effectTypeTokens.unlockProgramme]: unlockProgramme,
      [effectTypeTokens.promptCall]: promptCall,
      [effectTypeTokens.awardBadge]: awardBadge,
      [effectTypeTokens.inAppMessage]: inAppMessage,
    };
  }

  async dispatch(input: EffectDispatchInput): Promise<void> {
    const handler = this.handlers[input.rule.effectType];

    if (!handler) {
      throw new EffectParameterError(
        `${input.rule.effectType} has no effect handler and must not run`,
      );
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const written = await handler.write(manager, input);

      // Throws on anything but a clean completion, which rolls the effect back
      // with it. A handler whose lease was taken over must leave nothing
      // behind.
      await this.ledger.markFiredOrThrow(
        input.event.userId,
        input.reservation.ledgerId,
        input.reservation.leaseToken,
        manager,
      );

      return written;
    });

    // Only once the transaction has committed. Reporting from inside it would
    // announce a badge that a refused reservation then rolled back, and PostHog
    // has no way to take an event back.
    if (outcome) {
      this.report(outcome, input);
    }
  }

  // Best-effort, and guarded here as well as in the analytics implementation:
  // the effect itself is already durable by this point, so a throw would fail a
  // dispatch that actually succeeded and hand the event back for a retry that
  // re-runs nothing.
  private report(outcome: EffectWriteOutcome, input: EffectDispatchInput): void {
    try {
      this.analytics.capture({
        identity: { userId: input.event.userId },
        event: outcome.analytics.event,
        properties: outcome.analytics.properties,
        // The reservation is one-per-rule-firing, so it is the natural key for
        // "this effect happened once".
        uuid: input.reservation.ledgerId,
      });
    } catch (error) {
      this.logger.warn(
        `Product analytics capture failed for ${outcome.analytics.event}: ${String(error)}`,
      );
    }
  }
}
