import {
  contentEngineCatalogue,
  effectTypes,
  eventNames,
  operatorDefinitions,
  operators,
  userAttributeNames,
  type ConditionSource,
  type EffectType,
  type EventName,
  type FieldDefinition,
  type FieldType,
  type Operator,
} from "./catalogue.js";

/**
 * One selectable condition field, already carrying the metadata an authoring UI
 * needs to pick an operator and a value editor. `source` travels with the option
 * because an event payload field and a user attribute can share a name.
 */
export interface RuleFieldOption {
  readonly source: ConditionSource;
  readonly field: string;
  readonly type: FieldType;
}

const eventSource: ConditionSource = contentEngineCatalogue.conditionSources[0];
const userSource: ConditionSource = contentEngineCatalogue.conditionSources[1];

// The user attributes are event-independent, so the option list is built once
// and shared by every event.
const userFieldOptions: readonly RuleFieldOption[] = userAttributeNames.map(
  (field) => ({
    source: userSource,
    field,
    type: contentEngineCatalogue.userAttributes[field].type,
  }),
);

const fieldOptionsByEvent = {} as Record<EventName, readonly RuleFieldOption[]>;

for (const event of eventNames) {
  const fields = contentEngineCatalogue.events[event].fields as Record<
    string,
    FieldDefinition
  >;

  fieldOptionsByEvent[event] = [
    ...Object.entries(fields).map(
      ([field, { type }]): RuleFieldOption => ({
        source: eventSource,
        field,
        type,
      }),
    ),
    ...userFieldOptions,
  ];
}

const operatorsByFieldType = {} as Record<FieldType, readonly Operator[]>;

for (const fieldType of ["string", "number", "boolean"] as const) {
  operatorsByFieldType[fieldType] = operators.filter((operator) =>
    (operatorDefinitions[operator].fieldTypes as readonly FieldType[]).includes(
      fieldType,
    ),
  );
}

/**
 * Every field a rule on `event` may read: that event's payload fields first,
 * then the allowlisted user attributes. Fields of other events are never
 * reachable, which is what keeps authored conditions evaluable.
 */
export function fieldsForEvent(event: EventName): readonly RuleFieldOption[] {
  return fieldOptionsByEvent[event];
}

/** The operators the catalogue permits against a field of this type. */
export function operatorsForFieldType(type: FieldType): readonly Operator[] {
  return operatorsByFieldType[type];
}

/**
 * Effects an author may select. The catalogue's `authorTimeAllowed` flag is the
 * source of truth, so an effect that becomes authorable later needs no change
 * here.
 */
export const authorableEffectTypes: readonly EffectType[] = effectTypes.filter(
  (effect) => contentEngineCatalogue.effects[effect].authorTimeAllowed,
);
