import {
  contentEngineCatalogue,
  conditionSourceSchema,
  eventNameSchema,
  userAttributeFields,
  type FieldDefinition,
  type FieldType,
} from "./catalogue.js";
import { compareConditionValue } from "./comparison.js";

export interface AuthoredCondition {
  readonly source: string;
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

export type ConditionValidationResult =
  | { readonly valid: true; readonly fieldType: FieldType }
  | { readonly valid: false; readonly reason: string };

export function validateCondition(
  eventName: string,
  condition: AuthoredCondition,
): ConditionValidationResult {
  const parsedEvent = eventNameSchema.safeParse(eventName);
  if (!parsedEvent.success) {
    return { valid: false, reason: `${eventName} is not a known event` };
  }

  const parsedSource = conditionSourceSchema.safeParse(condition.source);
  if (!parsedSource.success) {
    return {
      valid: false,
      reason: `${condition.source} is not a known condition source`,
    };
  }

  let fieldDefinition: FieldDefinition | undefined;
  if (parsedSource.data === "event") {
    const eventFields = contentEngineCatalogue.events[parsedEvent.data]
      .fields as Record<string, FieldDefinition>;
    fieldDefinition = eventFields[condition.field];
    if (!fieldDefinition) {
      return {
        valid: false,
        reason: `${condition.field} is not readable from ${eventName}`,
      };
    }
  } else {
    fieldDefinition = (userAttributeFields as Record<string, FieldDefinition>)[
      condition.field
    ];
    if (!fieldDefinition) {
      return {
        valid: false,
        reason: `${condition.field} is not an allowed user attribute`,
      };
    }
  }

  const comparisonValidation = compareConditionValue({
    actual: undefined,
    expected: condition.value,
    fieldType: fieldDefinition.type,
    operator: condition.operator,
  });

  if (!comparisonValidation.valid) {
    return comparisonValidation;
  }

  return { valid: true, fieldType: fieldDefinition.type };
}
