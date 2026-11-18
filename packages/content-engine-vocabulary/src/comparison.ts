import {
  operatorDefinitions,
  operatorSchema,
  type FieldType,
  type Operator,
} from "./catalogue.js";

export type ComparisonResult =
  | { readonly valid: true; readonly matches: boolean }
  | { readonly valid: false; readonly reason: string };

export interface ComparisonInput {
  readonly actual: unknown;
  readonly expected: unknown;
  readonly fieldType: FieldType;
  readonly operator: string;
}

const pluralTypeNames: Record<FieldType, string> = {
  string: "strings",
  number: "numbers",
  boolean: "booleans",
};

function hasFieldType(value: unknown, fieldType: FieldType): boolean {
  if (fieldType === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }

  return typeof value === fieldType;
}

function validateExpected(
  operator: Operator,
  fieldType: FieldType,
  expected: unknown,
): ComparisonResult | null {
  if (operator === "in") {
    if (!Array.isArray(expected)) {
      return { valid: false, reason: "in requires a list value" };
    }

    if (!expected.every((value) => hasFieldType(value, fieldType))) {
      return {
        valid: false,
        reason: `expected values must all be ${pluralTypeNames[fieldType]}`,
      };
    }

    return null;
  }

  if (Array.isArray(expected)) {
    return { valid: false, reason: `${operator} requires a single value` };
  }

  if (!hasFieldType(expected, fieldType)) {
    return { valid: false, reason: `expected value must be a ${fieldType}` };
  }

  return null;
}

export function compareConditionValue(input: ComparisonInput): ComparisonResult {
  const parsedOperator = operatorSchema.safeParse(input.operator);
  if (!parsedOperator.success) {
    return { valid: false, reason: `${input.operator} is not a known operator` };
  }

  const operator = parsedOperator.data;
  const definition = operatorDefinitions[operator];
  if (!(definition.fieldTypes as readonly FieldType[]).includes(input.fieldType)) {
    return {
      valid: false,
      reason: `${operator} is not valid for ${input.fieldType} fields`,
    };
  }

  const expectedError = validateExpected(operator, input.fieldType, input.expected);
  if (expectedError) {
    return expectedError;
  }

  if (input.actual === undefined || input.actual === null) {
    return { valid: true, matches: false };
  }

  if (!hasFieldType(input.actual, input.fieldType)) {
    return {
      valid: false,
      reason: `actual value must be a ${input.fieldType}`,
    };
  }

  switch (operator) {
    case "eq":
      return { valid: true, matches: Object.is(input.actual, input.expected) };
    case "neq":
      return { valid: true, matches: !Object.is(input.actual, input.expected) };
    case "in":
      return {
        valid: true,
        matches: (input.expected as readonly unknown[]).some((value) =>
          Object.is(input.actual, value),
        ),
      };
    case "gte":
      return {
        valid: true,
        matches: (input.actual as number) >= (input.expected as number),
      };
    case "lte":
      return {
        valid: true,
        matches: (input.actual as number) <= (input.expected as number),
      };
  }
}
