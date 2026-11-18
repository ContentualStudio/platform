import type { EventName } from "@contentual/content-engine-vocabulary";

// The stages a single rule can fail at, in the order the evaluator reaches
// them. Naming them keeps a failure report answerable: "rule 7 failed" is not
// actionable, "rule 7 failed at reserve" is.
export const ruleEvaluationStages = {
  parse: "parse",
  condition: "condition",
  reserve: "reserve",
  effect: "effect",
} as const;

export type RuleEvaluationStage =
  (typeof ruleEvaluationStages)[keyof typeof ruleEvaluationStages];

/**
 * What one evaluation run did, as rule identifiers only.
 *
 * Identifiers and reasons, never condition values, effect parameters or event
 * payloads. Rule bodies are authored content and payloads are user data; an
 * analytics pipeline is the wrong place for either, and once captured they are
 * out of this system's control.
 */
export interface RuleEvaluationObservation {
  readonly eventId: string;
  readonly eventName: EventName;
  readonly userId: string;
  readonly consideredRuleIds: readonly string[];
  readonly qualifiedRuleIds: readonly string[];
  readonly firedRuleIds: readonly string[];
  readonly skipped: ReadonlyArray<{ ruleId: string; reason: string }>;
  readonly failed: ReadonlyArray<{
    ruleId: string;
    stage: string;
    error: string;
  }>;
}

/**
 * What one on-demand backfill run did, as counts and one rule identifier.
 *
 * Deliberately not per-user: a backfill can touch every user in the product,
 * and a per-user analytics event for each would be a second, unasked-for copy
 * of the user table in PostHog. Per-rule failures during the run are still
 * reported individually through `recordRuleError`.
 */
export interface RuleBackfillObservation {
  readonly runId: string;
  readonly ruleId: string;
  readonly eventName: EventName;
  // Users, which is what the rollout is judged on.
  readonly usersInScope: number;
  readonly usersFired: number;
  readonly usersSkipped: number;
  readonly usersFailed: number;
  // Candidates, which is what the scan is expressed in. A user can produce
  // several, so these are reported alongside the user counts rather than
  // standing in for them.
  readonly candidatesScanned: number;
  readonly candidatesFired: number;
  readonly candidatesSkipped: number;
  readonly candidatesFailed: number;
  readonly skippedReasons: Readonly<Record<string, number>>;
  readonly stoppedBecause: string;
}

export interface RuleEvaluationRuleError {
  readonly eventId: string;
  readonly eventName: EventName;
  readonly userId: string;
  readonly ruleId: string;
  readonly stage: RuleEvaluationStage;
  readonly error: string;
}

/**
 * Where an evaluation run is reported.
 *
 * Every implementation must be best-effort: an observer that throws would turn
 * an analytics outage into an event-delivery outage, since the dispatcher would
 * see the evaluation fail and leave the event pending forever.
 */
export interface RuleEvaluationObserver {
  record(summary: RuleEvaluationObservation): Promise<void>;
  recordRuleError(input: RuleEvaluationRuleError): Promise<void>;
  recordBackfill(summary: RuleBackfillObservation): Promise<void>;
}

// Nest cannot inject an interface, so the port is bound by symbol.
export const RULE_EVALUATION_OBSERVER = Symbol("RULE_EVALUATION_OBSERVER");
