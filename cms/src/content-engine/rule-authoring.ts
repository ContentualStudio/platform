import {
  dedupeScopeSchema,
  effectTypeSchema,
  effectTypeTokens,
  eventNameSchema,
  validateCondition,
  type ConditionSource,
  type DedupeScope,
  type EffectType,
  type EventName,
  type Operator,
} from "@contentual/content-engine-vocabulary";

import { relationshipSourceId, trimmedText } from "../payload-values";

// The stored field names, shared by the validator, the collection config, and
// the projection so a rename cannot leave one of them addressing a field that no
// longer exists.
export const ruleFieldNames = {
  triggerEvent: "triggerEvent",
  conditions: "conditions",
  effectType: "effectType",
  programme: "programme",
  badge: "badge",
  callType: "callType",
  message: "message",
  dedupeScope: "dedupeScope",
  active: "active",
} as const;

const {
  triggerEvent: triggerEventField,
  conditions: conditionsField,
  effectType: effectTypeField,
  programme: programmeField,
  badge: badgeField,
  callType: callTypeField,
  message: messageField,
  dedupeScope: dedupeScopeField,
} = ruleFieldNames;

/**
 * A rule exactly as Payload stores it. Every field is `unknown` because this
 * validator is the trust boundary: the admin UI, the REST API, and a partial
 * update all reach it, and none of them are trusted to have produced a
 * well-formed rule.
 */
export interface AuthoredEngineRule {
  triggerEvent: unknown;
  conditions: unknown;
  effectType: unknown;
  programme?: unknown;
  badge?: unknown;
  callType?: unknown;
  message?: unknown;
  dedupeScope: unknown;
  active?: unknown;
  priority?: unknown;
}

export interface NormalizedCondition {
  source: ConditionSource;
  field: string;
  operator: Operator;
  value: unknown;
}

export type NormalizedEffectParams =
  | { programmeSourceId: string }
  | { badgeSourceId: string }
  | { callTypeSourceId: string }
  | { message: string };

/** The evaluator-shaped rule. This is what the mirror stores, verbatim. */
export interface NormalizedEngineRule {
  triggerEvent: EventName;
  conditions: NormalizedCondition[];
  effectType: EffectType;
  effectParams: NormalizedEffectParams;
  dedupeScope: DedupeScope;
  active: boolean;
}

/**
 * A rejection, addressed to the field an author has to fix. The field name is
 * produced where the error is raised rather than inferred from the message, so
 * the admin UI can attach every error to a real control.
 */
export interface RuleValidationError {
  field: string;
  message: string;
}

export type RuleValidationResult =
  | { valid: true; rule: NormalizedEngineRule }
  | { valid: false; errors: readonly RuleValidationError[] };

// Conditions are validated one row at a time so an author sees every broken row
// at once, numbered as the editor displays them.
function normalizeConditions(
  triggerEvent: EventName | null,
  value: unknown,
  errors: RuleValidationError[],
): NormalizedCondition[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push({
      field: conditionsField,
      message: "Conditions must be a list",
    });
    return [];
  }

  const normalized: NormalizedCondition[] = [];

  value.forEach((row, index) => {
    const label = `Condition ${index + 1}`;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push({
        field: conditionsField,
        message: `${label}: must be a condition record`,
      });
      return;
    }

    const candidate = row as Record<string, unknown>;
    const source = candidate.source;
    const field = candidate.field;
    const operator = candidate.operator;

    if (typeof field !== "string" || field.trim() === "") {
      errors.push({
        field: conditionsField,
        message: `${label}: a field is required`,
      });
      return;
    }

    // Without a valid trigger there is no field vocabulary to check against, so
    // the trigger error already reported is the actionable one.
    if (!triggerEvent) {
      return;
    }

    const validation = validateCondition(triggerEvent, {
      source: String(source),
      field,
      operator: String(operator),
      value: candidate.value,
    });

    if (!validation.valid) {
      errors.push({
        field: conditionsField,
        message: `${label}: ${validation.reason}`,
      });
      return;
    }

    // validateCondition proved each token; parsing again only narrows the types
    // for the normalized row.
    normalized.push({
      source: source as ConditionSource,
      field,
      operator: operator as Operator,
      value: candidate.value,
    });
  });

  return normalized;
}

function normalizeEffect(
  input: AuthoredEngineRule,
  errors: RuleValidationError[],
): { effectType: EffectType; effectParams: NormalizedEffectParams } | null {
  if (input.effectType === undefined || input.effectType === null) {
    errors.push({ field: effectTypeField, message: "An effect is required" });
    return null;
  }

  const parsed = effectTypeSchema.safeParse(input.effectType);

  if (!parsed.success) {
    errors.push({
      field: effectTypeField,
      message: `${String(input.effectType)} is not a known effect`,
    });
    return null;
  }

  const effectType = parsed.data;

  switch (effectType) {
    case effectTypeTokens.suggestProgramme:
    case effectTypeTokens.unlockProgramme: {
      const programmeSourceId = relationshipSourceId(input.programme);

      if (!programmeSourceId) {
        errors.push({
          field: programmeField,
          message: `${effectType} requires a programme`,
        });
        return null;
      }

      return { effectType, effectParams: { programmeSourceId } };
    }

    case effectTypeTokens.awardBadge: {
      const badgeSourceId = relationshipSourceId(input.badge);

      if (!badgeSourceId) {
        errors.push({
          field: badgeField,
          message: `${effectType} requires a badge`,
        });
        return null;
      }

      return { effectType, effectParams: { badgeSourceId } };
    }

    case effectTypeTokens.promptCall: {
      const callTypeSourceId = relationshipSourceId(input.callType);

      if (!callTypeSourceId) {
        errors.push({
          field: callTypeField,
          message: `${effectType} requires a call type`,
        });
        return null;
      }

      return { effectType, effectParams: { callTypeSourceId } };
    }

    case effectTypeTokens.inAppMessage: {
      const message = trimmedText(input.message);

      if (!message) {
        errors.push({
          field: messageField,
          message: `${effectType} requires a message`,
        });
        return null;
      }

      return { effectType, effectParams: { message } };
    }

    // Still a vocabulary token so mirrored history stays readable, but v1 has no
    // way to grant a call, so it must never reach the mirror.
    case effectTypeTokens.grantCall:
      errors.push({
        field: effectTypeField,
        message: `${effectType} is not available in v1`,
      });
      return null;
  }
}

/**
 * Validates a complete rule for publication and returns evaluator-shaped data.
 * Never throws and never coerces: reporting every problem at once is what makes
 * the admin error usable, and a silent string-to-number conversion here would
 * mirror a rule that does not match what the author wrote.
 */
export function validateRuleForPublish(
  input: AuthoredEngineRule,
): RuleValidationResult {
  const errors: RuleValidationError[] = [];

  let triggerEvent: EventName | null = null;

  if (input.triggerEvent === undefined || input.triggerEvent === null) {
    errors.push({
      field: triggerEventField,
      message: "A trigger event is required",
    });
  } else {
    const parsedTrigger = eventNameSchema.safeParse(input.triggerEvent);

    if (parsedTrigger.success) {
      triggerEvent = parsedTrigger.data;
    } else {
      errors.push({
        field: triggerEventField,
        message: `${String(input.triggerEvent)} is not a known event`,
      });
    }
  }

  const conditions = normalizeConditions(
    triggerEvent,
    input.conditions,
    errors,
  );
  const effect = normalizeEffect(input, errors);

  let dedupeScope: DedupeScope | null = null;

  if (input.dedupeScope === undefined || input.dedupeScope === null) {
    errors.push({
      field: dedupeScopeField,
      message: "A dedupe scope is required",
    });
  } else {
    const parsedScope = dedupeScopeSchema.safeParse(input.dedupeScope);

    if (parsedScope.success) {
      dedupeScope = parsedScope.data;
    } else {
      errors.push({
        field: dedupeScopeField,
        message: `${String(input.dedupeScope)} is not a known dedupe scope`,
      });
    }
  }

  if (
    input.priority !== undefined &&
    input.priority !== null &&
    (typeof input.priority !== "number" ||
      !Number.isInteger(input.priority) ||
      input.priority < 0 ||
      input.priority > 2147483647)
  ) {
    errors.push({
      field: "priority",
      message: "Priority must be a non-negative 32-bit integer.",
    });
  }

  if (!triggerEvent || !effect || !dedupeScope || errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    rule: {
      triggerEvent,
      conditions,
      effectType: effect.effectType,
      effectParams: effect.effectParams,
      dedupeScope,
      // Publication and activation are separate decisions, so anything that is
      // not explicitly true is inactive.
      active: input.active === true,
    },
  };
}

// Re-exported: this module was where the helper lived before it was shared, and
// its importers should not have to move with it.
export { relationshipSourceId };
