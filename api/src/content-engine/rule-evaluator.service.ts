import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ContentEvent } from "./content-event";
import { EngineRuleRepository } from "./engine-rule.repository";
import type { ContentEventEvaluator } from "./event-evaluator.port";
import {
  RULE_EVALUATION_OBSERVER,
  ruleEvaluationStages,
  type RuleEvaluationObserver,
  type RuleEvaluationStage,
} from "./rule-evaluation-observer.port";
import { RuleFiringService } from "./rule-firing.service";
import { UserAttributeReaderFactory } from "./user-attribute.reader";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Some rules could not be completed, and retrying the event would help.
 *
 * Thrown after every rule has been attempted and the run has been reported, so
 * isolation still holds: the rules that succeeded have already fired and been
 * marked, and the ones that failed are the only reason this is raised.
 *
 * The dispatcher reads a rejection as "leave the row pending and back off",
 * which is the only durable retry the engine has. Returning normally would mark
 * the event `delivered`, and nothing would ever look at it again — an
 * `every_time` rule would lose its firing permanently, because its dedupe key
 * is that event's id and the event would never be evaluated a second time.
 *
 * Re-running the event is safe precisely because the ledger already dedupes:
 * a rule that fired reports `already_fired` on the retry and is skipped, so no
 * successful effect runs twice.
 */
export class RuleEvaluationIncompleteError extends Error {
  constructor(
    readonly eventId: string,
    readonly ruleIds: readonly string[],
  ) {
    super(
      `Rule evaluation incomplete for event ${eventId}; retryable rules: ${ruleIds.join(", ")}`,
    );
    this.name = "RuleEvaluationIncompleteError";
  }
}

/**
 * Evaluates every active rule listening for one delivered event.
 *
 * Rules are independent. A malformed mirror row, an unusable condition, a
 * reservation somebody else holds, or a handler that throws affects exactly one
 * rule — the rules after it still run. That isolation is the point: rules are
 * authored separately by people who cannot see each other's work, so one bad
 * rule must not be able to silence the rest.
 *
 * Only the inability to establish the run at all (selecting rules) rejects.
 * The dispatcher reads a rejection as "leave this event pending and retry", so
 * anything swallowed here is a decision that retrying would not help.
 *
 * Selecting and reporting is all this owns. Conditions, the dedupe key, the
 * reservation and the effect belong to RuleFiringService, which the on-demand
 * backfill drives too — so a backfilled firing and a live one cannot diverge.
 */
@Injectable()
export class RuleEvaluatorService implements ContentEventEvaluator {
  private readonly logger = new Logger(RuleEvaluatorService.name);

  constructor(
    private readonly rules: EngineRuleRepository,
    private readonly userAttributes: UserAttributeReaderFactory,
    private readonly firing: RuleFiringService,
    @Inject(RULE_EVALUATION_OBSERVER)
    private readonly observer: RuleEvaluationObserver,
  ) {}

  async evaluate(event: ContentEvent): Promise<void> {
    // Deliberately unguarded: if the rules cannot be read, no rule has been
    // considered and the event has not been evaluated. Swallowing that would
    // mark the event delivered and lose every effect it should have caused.
    const selected = await this.rules.findActiveByTrigger(event.eventName);

    const reader = this.userAttributes.forEvaluation();

    const consideredRuleIds: string[] = [];
    const qualifiedRuleIds: string[] = [];
    const firedRuleIds: string[] = [];
    const skipped: { ruleId: string; reason: string }[] = [];
    const failed: { ruleId: string; stage: string; error: string }[] = [];

    // Rules whose work is unfinished *and* worth another attempt. A permanent
    // failure is recorded but left out: retrying a rule that names a badge
    // which does not exist would fail identically forever and hold the event
    // pending with it.
    const retryableRuleIds: string[] = [];

    const fail = async (
      ruleId: string,
      stage: RuleEvaluationStage,
      error: string,
      retryable: boolean,
    ) => {
      failed.push({ ruleId, stage, error });

      if (retryable) {
        retryableRuleIds.push(ruleId);
      }

      await this.reportRuleError(event, ruleId, stage, error);
    };

    for (const invalid of selected.invalid) {
      consideredRuleIds.push(invalid.ruleId);
      // A row that will not parse will not parse on the next attempt either.
      await fail(
        invalid.ruleId,
        ruleEvaluationStages.parse,
        invalid.reason,
        false,
      );
    }

    for (const rule of selected.valid) {
      consideredRuleIds.push(rule.id);

      const result = await this.firing.fire(rule, event, reader);

      if (result.qualified) {
        qualifiedRuleIds.push(rule.id);
      }

      if (result.outcome === "failed") {
        await fail(rule.id, result.stage, result.error, result.retryable);
        continue;
      }

      if (result.outcome === "skipped") {
        skipped.push({ ruleId: rule.id, reason: result.reason });

        // `reservation_held` means somebody still owns this key — most often a
        // previous attempt that died before completing. Its effect has not run
        // and nothing else will come back for it, so this event has to. Once
        // the lease expires the retry reclaims it; if the holder was a live
        // worker that succeeded, the retry sees `already_fired` and skips.
        if (result.reason === "reservation_held") {
          retryableRuleIds.push(rule.id);
        }

        continue;
      }

      firedRuleIds.push(rule.id);
    }

    await this.report(() =>
      this.observer.record({
        eventId: event.id,
        eventName: event.eventName,
        userId: event.userId,
        consideredRuleIds,
        qualifiedRuleIds,
        firedRuleIds,
        skipped,
        failed,
      }),
    );

    // Reported first, then raised: the run is observable either way, and the
    // rules that succeeded keep their firings. Only the unfinished ones bring
    // the event back.
    if (retryableRuleIds.length > 0) {
      throw new RuleEvaluationIncompleteError(event.id, retryableRuleIds);
    }
  }

  private async reportRuleError(
    event: ContentEvent,
    ruleId: string,
    stage: RuleEvaluationStage,
    error: string,
  ): Promise<void> {
    await this.report(() =>
      this.observer.recordRuleError({
        eventId: event.id,
        eventName: event.eventName,
        userId: event.userId,
        ruleId,
        stage,
        error,
      }),
    );
  }

  // Observation is never allowed to change what the evaluator did. An observer
  // that throws is a broken observer, not a failed evaluation.
  private async report(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(
        `Rule evaluation observation failed: ${errorMessage(error)}`,
      );
    }
  }
}
