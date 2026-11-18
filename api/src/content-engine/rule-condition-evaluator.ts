import {
  compareConditionValue,
  conditionSourceTokens,
  contentEngineCatalogue,
  resolveUserAttribute,
  userAttributeNameSchema,
  type AppPostgresUserAttributeReader,
  type AuthoredCondition,
  type FieldDefinition,
  type FieldType,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import type { RuntimeEngineRule } from "./engine-rule";

export type RuleQualification =
  | { readonly qualifies: true }
  | {
      readonly qualifies: false;
      readonly reason: "condition_not_met" | "invalid_condition";
      readonly conditionIndex: number;
      readonly detail?: string;
    };

function notMet(conditionIndex: number): RuleQualification {
  return { qualifies: false, reason: "condition_not_met", conditionIndex };
}

function invalid(conditionIndex: number, detail: string): RuleQualification {
  return {
    qualifies: false,
    reason: "invalid_condition",
    conditionIndex,
    detail,
  };
}

function fieldTypeOf(
  condition: AuthoredCondition,
  event: ContentEvent,
): FieldType | null {
  if (condition.source === conditionSourceTokens.event) {
    const fields = contentEngineCatalogue.events[event.eventName]
      .fields as Record<string, FieldDefinition>;

    return fields[condition.field]?.type ?? null;
  }

  if (condition.source === conditionSourceTokens.user) {
    const attributes = contentEngineCatalogue.userAttributes as Record<
      string,
      FieldDefinition
    >;

    return attributes[condition.field]?.type ?? null;
  }

  return null;
}

// Event fields are read from the payload alone. The envelope's own id/userId
// and anything on the user row are deliberately unreachable: the catalogue
// describes payload fields, so reading elsewhere would let a condition match on
// data the author never selected.
async function actualValueOf(
  condition: AuthoredCondition,
  event: ContentEvent,
  reader: AppPostgresUserAttributeReader,
): Promise<unknown> {
  if (condition.source === conditionSourceTokens.event) {
    return (event.payload as Record<string, unknown>)[condition.field];
  }

  const attribute = userAttributeNameSchema.safeParse(condition.field);

  if (!attribute.success) {
    return undefined;
  }

  return resolveUserAttribute(attribute.data, event.userId, reader);
}

/**
 * Decides whether one rule's conditions hold for one event.
 *
 * Conditions are ANDed, so evaluation stops at the first that fails or is
 * unusable. That short-circuit is a contract, not an optimisation: a user
 * condition costs a database read, and a rule whose first condition already
 * ruled the event out must not pay for the rest.
 *
 * A rule with no conditions qualifies — it listens for the event itself.
 */
export async function qualifiesRule(
  rule: RuntimeEngineRule,
  event: ContentEvent,
  reader: AppPostgresUserAttributeReader,
): Promise<RuleQualification> {
  for (const [index, condition] of rule.conditions.entries()) {
    const fieldType = fieldTypeOf(condition, event);

    if (!fieldType) {
      return invalid(
        index,
        `${condition.field} is not readable from ${event.eventName}`,
      );
    }

    const actual = await actualValueOf(condition, event, reader);

    const comparison = compareConditionValue({
      actual,
      expected: condition.value,
      fieldType,
      operator: condition.operator,
    });

    // A comparison can be invalid here even though the rule parsed: parsing
    // checks the authored value against the operator, while this also sees the
    // runtime actual value, which the mirror never described.
    if (!comparison.valid) {
      return invalid(index, comparison.reason);
    }

    if (!comparison.matches) {
      return notMet(index);
    }
  }

  return { qualifies: true };
}
