import {
  fieldDefinition,
  matchingFields,
  operatorCardinality,
  operatorsFor,
  type MatchingField,
  type MatchingOperator,
} from "@contentual/programme-matching-vocabulary";

export interface EditableCondition {
  field: MatchingField;
  operator: MatchingOperator;
  acceptedValues: (string | number)[];
}

export interface EditableRule {
  id: string;
  name: string;
  programme: string | null;
  active: boolean;
  priority: number | null;
  fallback: boolean;
  explanation: string;
  conditions: EditableCondition[];
}

export function createCondition(
  field: MatchingField = matchingFields[0],
): EditableCondition {
  return {
    field,
    operator: operatorsFor(field)[0],
    acceptedValues: [],
  };
}

export function createRule(index: number): EditableRule {
  return {
    id: `matching-rule-${Date.now()}-${index}`,
    name: `Rule ${index + 1}`,
    programme: null,
    active: true,
    priority: index + 1,
    fallback: false,
    explanation: "",
    conditions: [createCondition()],
  };
}

export function addRule(
  rules: readonly EditableRule[],
  index: number,
): EditableRule[] {
  const next = [...rules, createRule(index)];
  const fallbackIndex = next.findIndex((rule) => rule.fallback);
  const insertionIndex = fallbackIndex === -1 ? next.length - 1 : fallbackIndex;

  return reorderRules(next, next.length - 1, insertionIndex);
}

export function changeConditionField(
  rule: EditableRule,
  conditionIndex: number,
  field: MatchingField,
): EditableRule {
  const condition = createCondition(field);
  return {
    ...rule,
    conditions: rule.conditions.map((existing, index) =>
      index === conditionIndex ? condition : existing,
    ),
  };
}

export function changeConditionOperator(
  rule: EditableRule,
  conditionIndex: number,
  operator: MatchingOperator,
): EditableRule {
  const existing = rule.conditions[conditionIndex];

  if (!existing || !operatorsFor(existing.field).includes(operator)) {
    return rule;
  }

  return {
    ...rule,
    conditions: rule.conditions.map((condition, index) =>
      index === conditionIndex
        ? { ...condition, operator, acceptedValues: [] }
        : condition,
    ),
  };
}

export function setConditionValues(
  rule: EditableRule,
  conditionIndex: number,
  acceptedValues: (string | number)[],
): EditableRule {
  return {
    ...rule,
    conditions: rule.conditions.map((condition, index) =>
      index === conditionIndex ? { ...condition, acceptedValues } : condition,
    ),
  };
}

export function removeCondition(
  rule: EditableRule,
  conditionIndex: number,
): EditableRule {
  return {
    ...rule,
    conditions: rule.conditions.filter((_, index) => index !== conditionIndex),
  };
}

export function reorderRules(
  rules: readonly EditableRule[],
  from: number,
  to: number,
): EditableRule[] {
  if (
    from < 0 ||
    from >= rules.length ||
    to < 0 ||
    to >= rules.length
  ) {
    return [...rules];
  }

  const moved = [...rules];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);

  const normal = moved.filter((rule) => !rule.fallback);
  const fallback = moved.find((rule) => rule.fallback);
  const ordered = [...normal, ...(fallback ? [fallback] : [])];

  let normalPosition = 0;
  return ordered.map((rule) => {
    if (rule.fallback) {
      return { ...rule, priority: null, active: true };
    }

    const priority = normal.length - normalPosition;
    normalPosition += 1;
    return { ...rule, priority };
  });
}

export function ruleMoveAvailability(
  rules: readonly EditableRule[],
  index: number,
): { up: boolean; down: boolean } {
  const rule = rules[index];

  if (!rule || rule.fallback) {
    return { up: false, down: false };
  }

  return {
    up: index > 0,
    down: Boolean(rules[index + 1] && !rules[index + 1]?.fallback),
  };
}

export function addCondition(rule: EditableRule): EditableRule {
  return {
    ...rule,
    conditions: [...rule.conditions, createCondition()],
  };
}

export function programmeValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (value && typeof value === "object" && "id" in value) {
    return programmeValue((value as { id: unknown }).id);
  }

  return null;
}

function nonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function rulePriority(
  value: unknown,
  fallback: boolean,
  index: number,
): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  return fallback ? null : index + 1;
}

export function ruleFromValue(value: unknown, index: number): EditableRule {
  const source = value && typeof value === "object" ? value : {};
  const record = source as Record<string, unknown>;
  const fallback = record.fallback === true;
  const conditions = Array.isArray(record.conditions)
    ? record.conditions
        .map((condition) => conditionFromValue(condition))
        .filter((condition): condition is EditableCondition => condition !== null)
    : [];

  return {
    id: nonBlankString(record.id) ?? createRule(index).id,
    name: nonBlankString(record.name) ?? `Rule ${index + 1}`,
    programme: programmeValue(record.programme),
    active: record.active !== false,
    priority: rulePriority(record.priority, fallback, index),
    fallback,
    explanation: typeof record.explanation === "string" ? record.explanation : "",
    conditions,
  };
}

function conditionFromValue(value: unknown): EditableCondition | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const field = matchingFields.find((candidate) => candidate === record.field);
  if (!field) {
    return null;
  }
  const operator = operatorsFor(field).find((candidate) => candidate === record.operator);
  if (!operator) {
    return { ...createCondition(field), acceptedValues: [] };
  }
  const acceptedValues = Array.isArray(record.acceptedValues)
    ? record.acceptedValues.filter(
        (item): item is string | number =>
          typeof item === "string" || typeof item === "number",
      )
    : [];

  return { field, operator, acceptedValues };
}

export function acceptedValueKind(field: MatchingField): "choice" | "integer" {
  return fieldDefinition(field).kind === "integer" ? "integer" : "choice";
}

export function valueCardinality(operator: MatchingOperator): "single" | "list" {
  return operatorCardinality[operator];
}
