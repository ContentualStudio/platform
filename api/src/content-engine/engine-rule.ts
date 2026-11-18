import {
  dedupeScopeSchema,
  effectTypeSchema,
  eventNameSchema,
  validateCondition,
  type AuthoredCondition,
  type DedupeScope,
  type EffectType,
  type EventName,
} from "@contentual/content-engine-vocabulary";

// One mirrored rule, in the shape the evaluator runs against. `effectParams`
// stays opaque: only the effect handler for `effectType` knows what its
// parameters mean, so validating them here would duplicate that knowledge and
// go stale the moment a handler changes.
export interface RuntimeEngineRule {
  readonly priority?: number;
  readonly id: string;
  readonly key: string;
  readonly triggerEvent: EventName;
  readonly conditions: readonly AuthoredCondition[];
  readonly effectType: EffectType;
  readonly effectParams: Readonly<Record<string, unknown>>;
  readonly dedupeScope: DedupeScope;
}

export type RuntimeRuleParseResult =
  | { readonly valid: true; readonly rule: RuntimeEngineRule }
  | { readonly valid: false; readonly ruleId: string; readonly reason: string };

// A rule that cannot be parsed is reported, never thrown. One malformed row
// must not stop the rules after it from being evaluated, so every failure has
// to come back as a value the caller can collect.
const UNIDENTIFIED_RULE = "unknown";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

// The row's id is needed even when the row is unusable — an unreported rule id
// is an un-debuggable authoring mistake.
function ruleIdOf(row: unknown): string {
  if (!isPlainObject(row)) {
    return UNIDENTIFIED_RULE;
  }

  return requiredText(row.sourceDocumentId) ?? UNIDENTIFIED_RULE;
}

function invalid(row: unknown, reason: string): RuntimeRuleParseResult {
  return { valid: false, ruleId: ruleIdOf(row), reason };
}

// Conditions arrive as jsonb, so each element is `unknown` until proven to
// carry the four authored fields.
function parseConditionShape(value: unknown): AuthoredCondition | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    typeof value.source !== "string" ||
    typeof value.field !== "string" ||
    typeof value.operator !== "string"
  ) {
    return null;
  }

  return {
    source: value.source,
    field: value.field,
    operator: value.operator,
    value: value.value,
  };
}

/**
 * Turns one `engine_rules` row into a rule the evaluator can run, or reports
 * why it cannot.
 *
 * The CMS validates rules at authoring time, but that is a different process
 * writing a different database at a different moment. A mirror row can predate
 * a vocabulary change, be written by a partially-deployed CMS, or be edited by
 * hand. Re-validating here is what keeps a bad row from reaching the ledger.
 */
export function parseRuntimeEngineRule(row: unknown): RuntimeRuleParseResult {
  if (!isPlainObject(row)) {
    return invalid(row, "rule row is not an object");
  }

  const id = requiredText(row.sourceDocumentId);
  if (!id) {
    return invalid(row, "sourceDocumentId is missing");
  }

  const key = requiredText(row.key);
  if (!key) {
    return invalid(row, "key is missing");
  }

  const triggerEvent = eventNameSchema.safeParse(row.triggerEvent);
  if (!triggerEvent.success) {
    return invalid(row, `${String(row.triggerEvent)} is not a known event`);
  }

  const effectType = effectTypeSchema.safeParse(row.effectType);
  if (!effectType.success) {
    return invalid(row, `${String(row.effectType)} is not a known effect type`);
  }

  const dedupeScope = dedupeScopeSchema.safeParse(row.dedupeScope);
  if (!dedupeScope.success) {
    return invalid(
      row,
      `${String(row.dedupeScope)} is not a known dedupe scope`,
    );
  }

  if (!Array.isArray(row.conditions)) {
    return invalid(row, "conditions is not a list");
  }

  if (
    row.priority !== undefined &&
    (typeof row.priority !== "number" ||
      !Number.isInteger(row.priority) ||
      row.priority < 0 ||
      row.priority > 2147483647)
  ) {
    return invalid(row, "priority must be a non-negative 32-bit integer");
  }

  const conditions: AuthoredCondition[] = [];

  for (const [index, entry] of row.conditions.entries()) {
    const condition = parseConditionShape(entry);

    if (!condition) {
      return invalid(row, `condition ${index + 1} is not a condition`);
    }

    // Validated against this rule's own trigger event: a condition reading a
    // field of some other event is unevaluable, however well-formed it looks.
    const validation = validateCondition(triggerEvent.data, condition);

    if (!validation.valid) {
      return invalid(row, `condition ${index + 1}: ${validation.reason}`);
    }

    conditions.push(condition);
  }

  if (!isPlainObject(row.effectParams)) {
    return invalid(row, "effectParams is not an object");
  }

  return {
    valid: true,
    rule: {
      id,
      priority:
        typeof row.priority === "number" && Number.isInteger(row.priority)
          ? row.priority
          : 100,
      key,
      triggerEvent: triggerEvent.data,
      conditions,
      effectType: effectType.data,
      effectParams: row.effectParams,
      dedupeScope: dedupeScope.data,
    },
  };
}
