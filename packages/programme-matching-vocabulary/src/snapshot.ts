import { z } from "zod";
import { matchingFieldSchema, matchingOperatorSchema } from "./catalogue.js";
import {
  validateMatchingCondition,
  type PublishedMatchingCondition,
} from "./condition.js";

// A published setup is immutable and self-describing: everything the evaluator
// needs is inside it, so a match made months ago can be replayed exactly, and
// so the runtime never has to consult Payload on the hot path.

export interface PublishedMatchingRule {
  readonly id: string;
  // What an operator called this route. Carried into the trace so a support
  // answer can say "the Plateau route won" rather than quoting a UUID.
  readonly name: string;
  // The stable handle of the target programme in the app-side content mirror,
  // plus the exact content version the rule was published against. Both are
  // copied into the assignment, which is what keeps a live user's journey on
  // the version they were matched to.
  readonly programmeKey: string;
  readonly programmeVersionId: string;
  readonly active: boolean;
  // Null only for the fallback, which is not ordered against anything.
  readonly priority: number | null;
  readonly fallback: boolean;
  readonly explanation: string;
  readonly conditions: readonly PublishedMatchingCondition[];
}

export interface PublishedMatchingSetup {
  readonly setupVersionId: string;
  readonly publishedAt: string;
  readonly rules: readonly PublishedMatchingRule[];
}

const requiredText = z.string().trim().min(1);

// Conditions are re-checked against the live catalogue on the way in, not
// merely shape-parsed. A snapshot published before an option was renamed must
// fail loudly at load rather than evaluate a comparison whose accepted value
// no longer exists.
const conditionSchema = z
  .object({
    field: matchingFieldSchema,
    operator: matchingOperatorSchema,
    acceptedValues: z.array(z.union([z.string(), z.number()])),
  })
  .strict()
  .superRefine((value, ctx) => {
    const result = validateMatchingCondition(value);

    if (!result.valid) {
      ctx.addIssue({ code: "custom", message: result.reason });
    }
  });

export const publishedMatchingRuleSchema = z
  .object({
    id: requiredText,
    name: requiredText,
    programmeKey: requiredText,
    programmeVersionId: requiredText,
    active: z.boolean(),
    priority: z.number().int().positive().nullable(),
    fallback: z.boolean(),
    explanation: requiredText,
    conditions: z.array(conditionSchema),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.fallback) {
      // The fallback answers "everyone else". Giving it conditions or a
      // priority would make it an ordinary rule wearing the wrong label, and
      // would quietly reintroduce the unmatched state it exists to prevent.
      if (rule.conditions.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Rule "${rule.name}": the fallback cannot have conditions`,
        });
      }

      if (rule.priority !== null) {
        ctx.addIssue({
          code: "custom",
          message: `Rule "${rule.name}": the fallback cannot have a priority`,
        });
      }

      return;
    }

    if (rule.conditions.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: `Rule "${rule.name}": a rule needs at least one condition`,
      });
    }

    if (rule.priority === null) {
      ctx.addIssue({
        code: "custom",
        message: `Rule "${rule.name}": a priority is required`,
      });
    }
  });

function checkExactlyOneFallback(
  rules: readonly PublishedMatchingRule[],
  ctx: z.RefinementCtx,
): void {
  const fallbacks = rules.filter((rule) => rule.fallback);

  if (fallbacks.length !== 1) {
    ctx.addIssue({
      code: "custom",
      message: `A published setup needs exactly one fallback rule; found ${fallbacks.length}`,
    });
  }
}

// Only *active* normal rules are ordered against each other. A deactivated
// rule keeps its priority so reactivating it is a one-click decision, and
// refusing that would force operators to renumber to park a rule.
function checkUniqueActivePriorities(
  rules: readonly PublishedMatchingRule[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<number>();

  for (const rule of rules) {
    if (rule.fallback || !rule.active || rule.priority === null) {
      continue;
    }

    if (seen.has(rule.priority)) {
      ctx.addIssue({
        code: "custom",
        message: `Rule "${rule.name}": priority ${rule.priority} is already used by another active rule`,
      });
    }

    seen.add(rule.priority);
  }
}

function checkUniqueIds(
  rules: readonly PublishedMatchingRule[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();

  for (const rule of rules) {
    if (seen.has(rule.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate rule id "${rule.id}"`,
      });
    }

    seen.add(rule.id);
  }
}

export const publishedMatchingSetupSchema = z
  .object({
    setupVersionId: requiredText,
    publishedAt: requiredText,
    rules: z.array(publishedMatchingRuleSchema).min(1),
  })
  .strict()
  .superRefine((setup, ctx) => {
    checkExactlyOneFallback(setup.rules, ctx);
    checkUniqueActivePriorities(setup.rules, ctx);
    checkUniqueIds(setup.rules, ctx);
  });
