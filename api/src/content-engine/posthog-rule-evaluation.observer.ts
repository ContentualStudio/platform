import { Injectable, Logger } from "@nestjs/common";
import { PostHogClientProvider } from "../observability/posthog-client.provider";
import type {
  RuleBackfillObservation,
  RuleEvaluationObservation,
  RuleEvaluationObserver,
  RuleEvaluationRuleError,
} from "./rule-evaluation-observer.port";

export const ruleEvaluationEventNames = {
  evaluation: "content_engine_evaluation",
  ruleError: "content_engine_rule_error",
  backfill: "content_engine_backfill",
} as const;

// A backfill is an operator action, not a user's, so it is captured against a
// fixed operational identity rather than against whichever user happened to be
// scanned. Attributing it to a real user would put an admin's decision in that
// person's analytics timeline.
const BACKFILL_DISTINCT_ID = "content-engine-backfill";

/**
 * Reports evaluation runs to PostHog, and swallows its own failures.
 *
 * Best-effort is the whole contract. The dispatcher treats a thrown evaluation
 * as "leave the event pending and retry", so an observer that propagated a
 * PostHog timeout would stall event delivery behind an analytics outage — and
 * a retry would re-run every effect that had already fired. Failures are logged
 * and dropped instead.
 *
 * Captured properties are rule identifiers, counts and reasons only. Condition
 * values, effect parameters and event payloads never leave the API.
 *
 * The client comes from `PostHogClientProvider` rather than being built here.
 * Rule-evaluation observability is one of several things this product reports on,
 * and a second client would mean a second batch queue that Nest's shutdown hook
 * flushes separately — one of which would eventually be forgotten.
 */
@Injectable()
export class PostHogRuleEvaluationObserver implements RuleEvaluationObserver {
  private readonly logger = new Logger(PostHogRuleEvaluationObserver.name);

  constructor(private readonly posthog: PostHogClientProvider) {}

  async record(summary: RuleEvaluationObservation): Promise<void> {
    this.capture(summary.userId, ruleEvaluationEventNames.evaluation, {
      eventId: summary.eventId,
      eventName: summary.eventName,
      consideredRuleIds: summary.consideredRuleIds,
      qualifiedRuleIds: summary.qualifiedRuleIds,
      firedRuleIds: summary.firedRuleIds,
      consideredCount: summary.consideredRuleIds.length,
      qualifiedCount: summary.qualifiedRuleIds.length,
      firedCount: summary.firedRuleIds.length,
      skipped: summary.skipped,
      failed: summary.failed,
      skippedCount: summary.skipped.length,
      failedCount: summary.failed.length,
    });
  }

  async recordRuleError(input: RuleEvaluationRuleError): Promise<void> {
    this.capture(input.userId, ruleEvaluationEventNames.ruleError, {
      eventId: input.eventId,
      eventName: input.eventName,
      ruleId: input.ruleId,
      stage: input.stage,
      error: input.error,
    });
  }

  async recordBackfill(summary: RuleBackfillObservation): Promise<void> {
    this.capture(BACKFILL_DISTINCT_ID, ruleEvaluationEventNames.backfill, {
      runId: summary.runId,
      ruleId: summary.ruleId,
      eventName: summary.eventName,
      usersInScope: summary.usersInScope,
      usersFired: summary.usersFired,
      usersSkipped: summary.usersSkipped,
      usersFailed: summary.usersFailed,
      candidatesScanned: summary.candidatesScanned,
      candidatesFired: summary.candidatesFired,
      candidatesSkipped: summary.candidatesSkipped,
      candidatesFailed: summary.candidatesFailed,
      skippedReasons: summary.skippedReasons,
      stoppedBecause: summary.stoppedBecause,
    });
  }

  // Flushing on shutdown belongs to PostHogClientProvider, which owns the
  // client's lifecycle. A second hook here would race the provider's for the
  // same queue.
  private capture(
    distinctId: string,
    event: string,
    properties: Record<string, unknown>,
  ): void {
    const client = this.posthog.client;

    if (!client) {
      return;
    }

    try {
      client.capture({ distinctId, event, properties });
    } catch (error) {
      this.logger.warn(`PostHog capture failed for ${event}: ${String(error)}`);
    }
  }
}
