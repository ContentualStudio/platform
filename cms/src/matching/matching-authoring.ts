import {
  publishedMatchingSetupSchema,
  validateMatchingCondition,
  type PublishedMatchingCondition,
  type PublishedMatchingRule,
} from "@contentual/programme-matching-vocabulary";

import { trimmedText } from "../payload-values";
import type { ProgrammeContentSnapshot } from "./programme-content-snapshot";

// The stored field names, shared by the validator, the collection config and the
// publisher, so a rename cannot leave one of them addressing a field that no
// longer exists.
export const matchingSetupFieldNames = {
  label: "label",
  rules: "rules",
} as const;

const { rules: rulesField, label: labelField } = matchingSetupFieldNames;

/**
 * A rule exactly as Payload stores it. Every property is `unknown` because this
 * validator is the trust boundary: the admin UI, the REST API and a partial
 * update all reach it, and none of them are trusted to have produced a
 * well-formed rule.
 */
export interface AuthoredMatchingRule {
  id?: unknown;
  name?: unknown;
  programme?: unknown;
  active?: unknown;
  priority?: unknown;
  fallback?: unknown;
  explanation?: unknown;
  conditions?: unknown;
}

export interface AuthoredMatchingSetup {
  label?: unknown;
  rules?: unknown;
}

/**
 * A rejection, addressed to the rule an author has to fix.
 *
 * `ruleLabel` is what the operator called the rule, not its identifier: the
 * specification asks for plain language that names the exact invalid rule and
 * condition, and "Rule 3" is only useful to whoever wrote the validator.
 */
export interface MatchingValidationError {
  field: string;
  ruleLabel: string | null;
  message: string;
}

/** What the publisher needs about a rule's target, resolved from Payload. */
export interface ProgrammeTarget {
  programmeKey: string;
  programmeVersionId: string;
  sourceDocumentId: string;
  sourceUpdatedAt: string;
  snapshot: ProgrammeContentSnapshot;
}

export interface ProgrammeTargetLookup {
  /**
   * Resolves a rule's programme relationship to its published content version,
   * or `null` when the programme is missing, draft, retired, archived, or has
   * no published content. The distinction between those cases belongs to the
   * lookup, which can see the document; this validator only reports that the
   * target is unusable.
   */
  resolve(reference: unknown): Promise<ProgrammeTarget | null>;
  /**
   * The same question asked of an already-published rule, which cites a
   * programme *key* rather than a Payload document id. Restore needs it: a
   * programme that was live when the version was first published may since
   * have been retired.
   */
  resolveKey(programmeKey: string): Promise<ProgrammeTarget | null>;
}

export type MatchingValidationResult =
  | {
      valid: true;
      rules: PublishedMatchingRule[];
      programmeTargets: ProgrammeTarget[];
    }
  | { valid: false; errors: MatchingValidationError[] };

function ruleLabelFor(rule: AuthoredMatchingRule, index: number): string {
  return trimmedText(rule.name) ?? `Rule ${index + 1}`;
}

// Conditions are checked one row at a time, numbered as the editor displays
// them, so an author sees every broken row at once instead of fixing one
// problem per publish attempt.
function normalizeConditions(
  rule: AuthoredMatchingRule,
  label: string,
  errors: MatchingValidationError[],
): PublishedMatchingCondition[] {
  const rows = rule.conditions;

  if (rows === undefined || rows === null) {
    return [];
  }

  if (!Array.isArray(rows)) {
    errors.push({
      field: rulesField,
      ruleLabel: label,
      message: `Rule "${label}": conditions must be a list`,
    });
    return [];
  }

  const normalized: PublishedMatchingCondition[] = [];

  rows.forEach((row, index) => {
    const position = `condition ${index + 1}`;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push({
        field: rulesField,
        ruleLabel: label,
        message: `Rule "${label}", ${position}: must be a condition record`,
      });
      return;
    }

    const candidate = row as Record<string, unknown>;
    const result = validateMatchingCondition({
      field: candidate.field,
      operator: candidate.operator,
      acceptedValues: candidate.acceptedValues,
    });

    if (!result.valid) {
      errors.push({
        field: rulesField,
        ruleLabel: label,
        message: `Rule "${label}", ${position}: ${result.reason}`,
      });
      return;
    }

    normalized.push(result.condition);
  });

  return normalized;
}

function normalizePriority(
  rule: AuthoredMatchingRule,
  label: string,
  isFallback: boolean,
  errors: MatchingValidationError[],
): number | null {
  if (isFallback) {
    return null;
  }

  const priority = rule.priority;

  if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1) {
    errors.push({
      field: rulesField,
      ruleLabel: label,
      message: `Rule "${label}": a priority is required, as a whole number of 1 or more. Higher priorities are evaluated first.`,
    });
    return null;
  }

  return priority;
}

// Reports the *first* unusable value rather than the whole zod dump: the
// message goes to a content operator, and "explanation is required" is what
// they can act on.
function requiredRuleText(
  rule: AuthoredMatchingRule,
  label: string,
  errors: MatchingValidationError[],
): { id: string; explanation: string } | null {
  const id = trimmedText(rule.id);
  const explanation = trimmedText(rule.explanation);

  if (!id) {
    errors.push({
      field: rulesField,
      ruleLabel: label,
      message: `Rule "${label}": an internal rule id is missing. Re-add the rule rather than editing it by hand.`,
    });
  }

  if (!explanation) {
    errors.push({
      field: rulesField,
      ruleLabel: label,
      message: `Rule "${label}": an explanation is required. It is what support reads back to a user who asks why they were matched.`,
    });
  }

  return id && explanation ? { id, explanation } : null;
}

async function normalizeRule(
  rule: AuthoredMatchingRule,
  index: number,
  programmes: ProgrammeTargetLookup,
  errors: MatchingValidationError[],
): Promise<{ rule: PublishedMatchingRule; target: ProgrammeTarget } | null> {
  const label = ruleLabelFor(rule, index);
  const text = requiredRuleText(rule, label, errors);
  const isFallback = rule.fallback === true;
  const priority = normalizePriority(rule, label, isFallback, errors);
  const conditions = normalizeConditions(rule, label, errors);
  const target = await programmes.resolve(rule.programme);

  if (!target) {
    errors.push({
      field: rulesField,
      ruleLabel: label,
      message: `Rule "${label}": choose a live programme with published content. The current target is missing, not live, or has never been published.`,
    });
  }

  if (!text || !target || (!isFallback && priority === null)) {
    return null;
  }

  return {
    rule: {
      id: text.id,
      name: label,
      programmeKey: target.programmeKey,
      programmeVersionId: target.programmeVersionId,
      // Publishing makes a rule real; activating makes it match. Anything not
      // explicitly true is inactive — except the fallback, which has to be live
      // or the setup guarantees nothing.
      active: isFallback ? true : rule.active === true,
      priority,
      fallback: isFallback,
      explanation: text.explanation,
      conditions: isFallback ? [] : conditions,
    },
    target,
  };
}

// Setup-wide checks — exactly one fallback, unique active priorities, no
// duplicate ids, a fallback with no conditions, a normal rule with at least one
// — are not restated here. They live in the shared snapshot schema, which is
// also what the API re-validates on load, so publication and runtime cannot
// disagree about what a valid setup is.
function setupLevelErrors(rules: PublishedMatchingRule[]): string[] {
  const result = publishedMatchingSetupSchema.safeParse({
    setupVersionId: "pending",
    publishedAt: new Date().toISOString(),
    rules,
  });

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/**
 * Validates a whole setup for publication and returns evaluator-shaped rules.
 *
 * Never throws and never repairs: a silently corrected rule would publish a
 * setup that does not say what its author wrote, and the author would not find
 * out until a user was matched by it.
 */
export async function validateMatchingSetupForPublish(
  input: AuthoredMatchingSetup,
  programmes: ProgrammeTargetLookup,
): Promise<MatchingValidationResult> {
  const errors: MatchingValidationError[] = [];

  if (!trimmedText(input.label)) {
    errors.push({
      field: labelField,
      ruleLabel: null,
      message: "Give this matching setup a name so its published versions can be told apart.",
    });
  }

  if (!Array.isArray(input.rules)) {
    errors.push({
      field: rulesField,
      ruleLabel: null,
      message: "A matching setup needs a list of rules, including exactly one fallback.",
    });
    return { valid: false, errors };
  }

  const authored = input.rules as AuthoredMatchingRule[];
  const normalized: PublishedMatchingRule[] = [];
  const programmeTargets: ProgrammeTarget[] = [];

  for (const [index, rule] of authored.entries()) {
    const result = await normalizeRule(rule, index, programmes, errors);

    if (result) {
      normalized.push(result.rule);

      if (
        !programmeTargets.some(
          (item) => item.programmeVersionId === result.target.programmeVersionId,
        )
      ) {
        programmeTargets.push(result.target);
      }
    }
  }

  // Setup-wide checks only run once every rule is individually sound.
  // Reporting "two rules share priority 10" while one of them has no valid
  // priority at all would point the author at the wrong rule.
  if (errors.length === 0) {
    for (const message of setupLevelErrors(normalized)) {
      errors.push({ field: rulesField, ruleLabel: null, message });
    }
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, rules: normalized, programmeTargets };
}

/**
 * Re-checks an already-published version before it is restored.
 *
 * A stored version is not trustworthy just because it was valid when it was
 * written. Since then an answer may have been renamed out of the vocabulary and
 * a target programme may have been retired — so restoring blind would activate
 * a setup that cannot match anyone, which is the one thing publication exists
 * to prevent.
 *
 * Targets are re-pinned to each programme's *current* published content rather
 * than kept at the version string they carried. Users already assigned keep
 * citing what they were matched under; a restore decides what new users get,
 * and that has to be content that exists today.
 */
export async function revalidateRulesForRestore(
  rules: readonly PublishedMatchingRule[],
  programmes: ProgrammeTargetLookup,
): Promise<MatchingValidationResult> {
  const errors: MatchingValidationError[] = [];
  const repinned: PublishedMatchingRule[] = [];
  const programmeTargets: ProgrammeTarget[] = [];

  for (const rule of rules) {
    const target = await programmes.resolveKey(rule.programmeKey);

    if (!target) {
      errors.push({
        field: rulesField,
        ruleLabel: rule.name,
        message: `Rule "${rule.name}": "${rule.programmeKey}" is no longer a live programme with published content, so this version cannot be restored as it stands.`,
      });
      continue;
    }

    repinned.push({ ...rule, programmeVersionId: target.programmeVersionId });
    if (!programmeTargets.some((item) => item.programmeVersionId === target.programmeVersionId)) {
      programmeTargets.push(target);
    }
  }

  // The shared snapshot schema re-checks every condition against the current
  // vocabulary, plus the fallback, priority and rule-shape invariants — the
  // same checks a first-time publication passes.
  if (errors.length === 0) {
    for (const message of setupLevelErrors(repinned)) {
      errors.push({ field: rulesField, ruleLabel: null, message });
    }
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, rules: repinned, programmeTargets };
}
