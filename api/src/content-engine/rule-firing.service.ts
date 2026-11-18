import { Inject, Injectable } from "@nestjs/common";
import type { AppPostgresUserAttributeReader } from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import {
  CONTENT_ENGINE_EFFECT_DISPATCHER,
  PermanentEffectError,
  type ContentEngineEffectDispatcher,
} from "./effect-dispatcher.port";
import type { RuntimeEngineRule } from "./engine-rule";
import { FiringLedgerService } from "./firing-ledger.service";
import { qualifiesRule } from "./rule-condition-evaluator";
import {
  ruleEvaluationStages,
  type RuleEvaluationStage,
} from "./rule-evaluation-observer.port";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What happened to one rule for one event.
 *
 * `retryable` is only meaningful to a caller that owns a durable retry — the
 * live dispatcher, which leaves the outbox row pending. A backfill has no such
 * queue: it reports the failure and the operator re-runs the job, which is safe
 * for exactly the reason a replay is (the ledger dedupes).
 */
export type RuleFiringOutcome =
  | { readonly outcome: "fired"; readonly qualified: true }
  | {
      readonly outcome: "skipped";
      readonly reason: string;
      readonly qualified: boolean;
    }
  | {
      readonly outcome: "failed";
      readonly stage: RuleEvaluationStage;
      readonly error: string;
      readonly retryable: boolean;
      readonly qualified: boolean;
    };

// Only the validated payload may supply the programme a firing is scoped to.
// Effect parameters are authored text and could name any programme, so letting
// them decide the dedupe key would let an author widen or narrow another rule's
// dedupe scope by accident.
function programmeIdFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "programmeId")) {
    return null;
  }

  const value = (payload as Record<string, unknown>).programmeId;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

/**
 * The firing path: conditions, dedupe key, reservation, effect — for one rule
 * and one event.
 *
 * Extracted from the evaluator so the on-demand backfill drives *this* code
 * rather than a parallel implementation of it. A backfill that re-derived the
 * dedupe key, or qualified conditions its own way, could fire a rule the live
 * evaluator would have skipped — and the two would drift silently, because
 * nothing compares them. Sharing the path makes "same conditions, same key,
 * same gate" a fact about the code instead of a promise in a ticket.
 *
 * This never marks a reservation fired. Completion belongs to the effect
 * handler, which alone knows whether its write can share a transaction with the
 * fired-mark — see FiringLedgerService.
 */
@Injectable()
export class RuleFiringService {
  constructor(
    private readonly ledger: FiringLedgerService,
    @Inject(CONTENT_ENGINE_EFFECT_DISPATCHER)
    private readonly effects: ContentEngineEffectDispatcher,
  ) {}

  async fire(
    rule: RuntimeEngineRule,
    event: ContentEvent,
    reader: AppPostgresUserAttributeReader,
  ): Promise<RuleFiringOutcome> {
    const qualification = await this.qualify(rule, event, reader);

    if (qualification.outcome === "error") {
      // A condition threw rather than not matching: an attribute read failed,
      // which is infrastructure and worth retrying.
      return {
        outcome: "failed",
        stage: ruleEvaluationStages.condition,
        error: qualification.error,
        retryable: true,
        qualified: false,
      };
    }

    if (!qualification.qualified) {
      return {
        outcome: "skipped",
        reason: qualification.reason,
        qualified: false,
      };
    }

    // Past this point the rule's conditions hold, whatever the gate decides.

    let reservation;
    try {
      reservation = await this.ledger.reserve({
        ruleId: rule.id,
        userId: event.userId,
        dedupeScope: rule.dedupeScope,
        programmeId: programmeIdFrom(event.payload),
        eventId: event.id,
      });
    } catch (error) {
      return {
        outcome: "failed",
        stage: ruleEvaluationStages.reserve,
        error: errorMessage(error),
        retryable: true,
        qualified: true,
      };
    }

    // The gate. A replayed event, a concurrent worker, a backfill catching up
    // with a live firing, or a firing that already happened all land here, and
    // none of them may run the effect.
    if (!reservation.fresh) {
      return {
        outcome: "skipped",
        reason: reservation.reason,
        qualified: true,
      };
    }

    try {
      await this.effects.dispatch({ rule, event, reservation });
      return { outcome: "fired", qualified: true };
    } catch (error) {
      // The reservation is left exactly as the handler found it. Marking it
      // fired here would claim an effect that did not happen; releasing it
      // would race the handler's own retry. The ledger's lease expiry is the
      // only correct arbiter.
      return {
        outcome: "failed",
        stage: ruleEvaluationStages.effect,
        error: errorMessage(error),
        retryable: !(error instanceof PermanentEffectError),
        qualified: true,
      };
    }
  }

  private async qualify(
    rule: RuntimeEngineRule,
    event: ContentEvent,
    reader: AppPostgresUserAttributeReader,
  ): Promise<
    | { outcome: "ok"; qualified: true }
    | { outcome: "ok"; qualified: false; reason: string }
    | { outcome: "error"; error: string }
  > {
    try {
      const qualification = await qualifiesRule(rule, event, reader);

      if (qualification.qualifies) {
        return { outcome: "ok", qualified: true };
      }

      return {
        outcome: "ok",
        qualified: false,
        reason: qualification.detail
          ? `${qualification.reason}: ${qualification.detail}`
          : qualification.reason,
      };
    } catch (error) {
      return { outcome: "error", error: errorMessage(error) };
    }
  }
}
