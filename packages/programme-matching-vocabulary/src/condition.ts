import {
  fieldDefinition,
  matchingFieldSchema,
  matchingOperatorSchema,
  matchingOperatorTokens,
  operatorCardinality,
  operatorsFor,
  type MatchingField,
  type MatchingFieldDefinition,
  type MatchingOperator,
} from "./catalogue.js";
import type { MatchingProfile } from "./profile.js";

// The stored shape of one condition, after validation. `acceptedValues` is a
// list even for single-valued operators: the wire shape stays uniform, and the
// arity rule is enforced at publication rather than encoded in two types.
export interface PublishedMatchingCondition {
  readonly field: MatchingField;
  readonly operator: MatchingOperator;
  readonly acceptedValues: readonly (string | number)[];
}

// A condition exactly as an author (or a REST client) supplied it. Every
// property is `unknown` because this is the trust boundary — nothing upstream
// is trusted to have produced a well-formed condition.
export interface AuthoredMatchingCondition {
  readonly field: unknown;
  readonly operator: unknown;
  readonly acceptedValues: unknown;
}

export type ConditionValidationResult =
  | { readonly valid: true; readonly condition: PublishedMatchingCondition }
  | { readonly valid: false; readonly reason: string };

function invalid(reason: string): ConditionValidationResult {
  return { valid: false, reason };
}

// Enum values must be tokens users can actually select; integers must land
// inside the questionnaire's own bounds. Both refusals name the offending
// value, because "condition 2 is invalid" is not something an author can act
// on.
function checkIntegerValue(
  definition: MatchingFieldDefinition,
  value: unknown,
): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return `${JSON.stringify(value)} is not a whole number`;
  }

  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } =
    definition;

  return value >= min && value <= max
    ? null
    : `${value} is outside the allowed range ${min}–${max}`;
}

function checkAcceptedValue(
  definition: MatchingFieldDefinition,
  value: unknown,
): string | null {
  if (definition.kind === "integer") {
    return checkIntegerValue(definition, value);
  }

  if (typeof value !== "string") {
    return `${JSON.stringify(value)} is not a selectable answer`;
  }

  return (definition.values ?? []).includes(value)
    ? null
    : `"${value}" is not an answer users can select`;
}

function checkArity(
  operator: MatchingOperator,
  values: readonly unknown[],
): string | null {
  if (values.length === 0) {
    return `${operator} needs at least one accepted answer`;
  }

  return operatorCardinality[operator] === "single" && values.length > 1
    ? `${operator} takes exactly one accepted answer; use one_of for several`
    : null;
}

/**
 * Validates one condition against the catalogue and returns it in evaluator
 * shape. Never throws and never coerces: a silently repaired condition would
 * mirror a rule that does not say what its author wrote.
 */
export function validateMatchingCondition(
  input: AuthoredMatchingCondition,
): ConditionValidationResult {
  const parsedField = matchingFieldSchema.safeParse(input.field);

  if (!parsedField.success) {
    return invalid(`${String(input.field)} is not a matching question`);
  }

  const field = parsedField.data;
  const parsedOperator = matchingOperatorSchema.safeParse(input.operator);

  if (!parsedOperator.success) {
    return invalid(`${String(input.operator)} is not a known comparison`);
  }

  const operator = parsedOperator.data;

  if (!operatorsFor(field).includes(operator)) {
    return invalid(`${operator} is not valid for ${field}`);
  }

  if (!Array.isArray(input.acceptedValues)) {
    return invalid(`${field} needs a list of accepted answers`);
  }

  const arityError = checkArity(operator, input.acceptedValues);

  if (arityError) {
    return invalid(arityError);
  }

  const definition = fieldDefinition(field);

  for (const value of input.acceptedValues) {
    const valueError = checkAcceptedValue(definition, value);

    if (valueError) {
      return invalid(valueError);
    }
  }

  return {
    valid: true,
    condition: {
      field,
      operator,
      acceptedValues: input.acceptedValues as readonly (string | number)[],
    },
  };
}

export interface ConditionOutcome {
  readonly passed: boolean;
  // Plain language, addressed to whoever is asking why a user did or did not
  // land on a programme. Stored with the assignment, so it has to read as an
  // explanation and not as a debug dump.
  readonly reason: string;
}

function rank(
  definition: MatchingFieldDefinition,
  value: string | number,
): number | null {
  if (definition.kind === "integer") {
    return typeof value === "number" ? value : null;
  }

  const index = (definition.ascending ?? []).indexOf(String(value));
  return index === -1 ? null : index;
}

function compareOrdered(
  definition: MatchingFieldDefinition,
  operator: MatchingOperator,
  actual: string | number,
  expected: string | number,
): ConditionOutcome {
  const actualRank = rank(definition, actual);
  const expectedRank = rank(definition, expected);

  // Only reachable if a snapshot outlived the catalogue that validated it —
  // an option renamed or dropped after publication. Failing closed keeps a
  // stale rule from quietly winning.
  if (actualRank === null || expectedRank === null) {
    return {
      passed: false,
      reason: `"${actual}" can no longer be ranked against "${expected}"`,
    };
  }

  const passed =
    operator === matchingOperatorTokens.gte
      ? actualRank >= expectedRank
      : actualRank <= expectedRank;
  const wording = operator === matchingOperatorTokens.gte ? "at least" : "at most";

  return {
    passed,
    reason: `${definition.label} is "${actual}", ${passed ? "which is" : "which is not"} ${wording} "${expected}"`,
  };
}

function compareMembership(
  definition: MatchingFieldDefinition,
  actual: string | number,
  accepted: readonly (string | number)[],
): ConditionOutcome {
  // A single accepted value is `equals`; several are `one_of`. Both are the
  // same question — is the answer one of these? — so they share one path and
  // one sentence.
  const passed = accepted.includes(actual);
  const list = accepted.map((value) => `"${value}"`).join(" or ");

  return {
    passed,
    reason: `${definition.label} is "${actual}", ${passed ? "which is" : "which is not"} ${list}`,
  };
}

const multiSelectPredicates = {
  [matchingOperatorTokens.containsAny]: (
    selected: readonly string[],
    accepted: readonly string[],
  ) => accepted.some((value) => selected.includes(value)),
  [matchingOperatorTokens.containsAll]: (
    selected: readonly string[],
    accepted: readonly string[],
  ) => accepted.every((value) => selected.includes(value)),
  [matchingOperatorTokens.containsNone]: (
    selected: readonly string[],
    accepted: readonly string[],
  ) => !accepted.some((value) => selected.includes(value)),
} as const;

const multiSelectWording = {
  [matchingOperatorTokens.containsAny]: "any of",
  [matchingOperatorTokens.containsAll]: "all of",
  [matchingOperatorTokens.containsNone]: "none of",
} as const;

type MultiSelectOperator = keyof typeof multiSelectPredicates;

function isMultiSelectOperator(
  operator: MatchingOperator,
): operator is MultiSelectOperator {
  return operator in multiSelectPredicates;
}

function compareMultiSelect(
  definition: MatchingFieldDefinition,
  operator: MultiSelectOperator,
  selected: readonly string[],
  accepted: readonly (string | number)[],
): ConditionOutcome {
  const wanted = accepted.map(String);
  const passed = multiSelectPredicates[operator](selected, wanted);
  const list = wanted.map((value) => `"${value}"`).join(", ");

  return {
    passed,
    reason: `${definition.label} is ${selected.length === 0 ? "empty" : selected.map((value) => `"${value}"`).join(", ")}, ${passed ? "which has" : "which does not have"} ${multiSelectWording[operator]} ${list}`,
  };
}

/**
 * Evaluates one validated condition against one profile.
 *
 * A missing answer always fails the condition. That is the specification's
 * rule and it is deliberately not softened for `contains_none`: "the user did
 * not tell us" is not evidence that they selected nothing.
 */
export function evaluateMatchingCondition(
  profile: MatchingProfile,
  condition: PublishedMatchingCondition,
): ConditionOutcome {
  const definition = fieldDefinition(condition.field);
  const actual = profile[condition.field];

  if (actual === null || actual === undefined) {
    return {
      passed: false,
      reason: `${definition.label} has no recorded answer`,
    };
  }

  if (isMultiSelectOperator(condition.operator)) {
    return compareMultiSelect(
      definition,
      condition.operator,
      actual as readonly string[],
      condition.acceptedValues,
    );
  }

  const scalar = actual as string | number;

  if (
    condition.operator === matchingOperatorTokens.gte ||
    condition.operator === matchingOperatorTokens.lte
  ) {
    return compareOrdered(
      definition,
      condition.operator,
      scalar,
      condition.acceptedValues[0],
    );
  }

  return compareMembership(definition, scalar, condition.acceptedValues);
}
