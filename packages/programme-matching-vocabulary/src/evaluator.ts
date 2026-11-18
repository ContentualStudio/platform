import {
  evaluateMatchingCondition,
  type ConditionOutcome,
} from "./condition.js";
import type { MatchingProfile } from "./profile.js";
import type {
  PublishedMatchingRule,
  PublishedMatchingSetup,
} from "./snapshot.js";

export interface ConsideredCondition extends ConditionOutcome {
  // Position as the rule editor numbers it, so a preview and a support
  // explanation point an operator at the same row.
  readonly index: number;
}

export interface ConsideredRule {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly priority: number | null;
  readonly qualified: boolean;
  readonly conditions: readonly ConsideredCondition[];
}

export interface MatchingTrace {
  readonly setupVersionId: string;
  readonly selectedRuleId: string;
  readonly selectedRuleName: string;
  readonly selectedProgrammeKey: string;
  readonly selectedProgrammeVersionId: string;
  readonly explanation: string;
  readonly fallbackUsed: boolean;
  // Recorded even though only one rule can win: a rising overlap count is how
  // operators find out their priorities no longer say what they meant.
  readonly multipleRulesQualified: boolean;
  readonly qualifyingRuleIds: readonly string[];
  readonly considered: readonly ConsideredRule[];
}

// Highest numeric priority first. Ties cannot reach here — publication refuses
// duplicate priorities among active rules — but the id tiebreak keeps the
// order total, so a corrupted snapshot still evaluates deterministically
// instead of depending on the database's row order.
function byDescendingPriority(
  left: PublishedMatchingRule,
  right: PublishedMatchingRule,
): number {
  const difference = (right.priority ?? 0) - (left.priority ?? 0);
  return difference === 0 ? left.id.localeCompare(right.id) : difference;
}

// Every condition is evaluated, not short-circuited on the first failure.
// Conditions are AND-ed, so the answer is the same either way — but a preview
// that showed only the first failing row would make an author fix one problem
// per publish attempt.
function considerRule(
  profile: MatchingProfile,
  rule: PublishedMatchingRule,
): ConsideredRule {
  const conditions = rule.conditions.map((condition, index) => ({
    index: index + 1,
    ...evaluateMatchingCondition(profile, condition),
  }));

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    priority: rule.priority,
    qualified: conditions.every((condition) => condition.passed),
    conditions,
  };
}

/**
 * The one evaluation primitive. Live matching and CMS preview both call this
 * and nothing else, which is what makes "preview shows what will happen" a
 * property of the code rather than a promise in a ticket.
 *
 * Pure by construction: no clock, no database, no randomness, no scoring. The
 * same profile and the same snapshot produce the same trace forever, which is
 * what makes a stored trace a real audit record.
 *
 * Throws only when the snapshot has no fallback rule. That is a corrupt
 * configuration, not a user condition, and the caller must fail closed rather
 * than complete onboarding with nobody assigned.
 */
export function evaluateMatchingSnapshot(
  profile: MatchingProfile,
  setup: PublishedMatchingSetup,
): MatchingTrace {
  const fallback = setup.rules.find((rule) => rule.fallback);

  if (!fallback) {
    throw new Error(
      `Matching setup ${setup.setupVersionId} has no fallback rule.`,
    );
  }

  const normalRules = setup.rules
    .filter((rule) => !rule.fallback && rule.active)
    .sort(byDescendingPriority);
  // `considered` is index-parallel to `normalRules`, so the winner is the first
  // rule whose outcome qualified — no lookup by id, and no unreachable
  // "qualified but not found" branch.
  const considered = normalRules.map((rule) => considerRule(profile, rule));
  const qualifyingRuleIds = considered
    .filter((rule) => rule.qualified)
    .map((rule) => rule.ruleId);
  const selected =
    normalRules.find((_, index) => considered[index].qualified) ?? fallback;

  return {
    setupVersionId: setup.setupVersionId,
    selectedRuleId: selected.id,
    selectedRuleName: selected.name,
    selectedProgrammeKey: selected.programmeKey,
    selectedProgrammeVersionId: selected.programmeVersionId,
    explanation: selected.explanation,
    fallbackUsed: selected.fallback,
    multipleRulesQualified: qualifyingRuleIds.length > 1,
    qualifyingRuleIds,
    considered,
  };
}
