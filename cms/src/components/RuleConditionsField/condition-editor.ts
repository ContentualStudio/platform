import {
  conditionSourceTokens,
  eventNameSchema,
  fieldsForEvent,
  operatorDefinitions,
  operatorSchema,
  operatorsForFieldType,
  type FieldType,
  type Operator,
  type RuleFieldOption,
} from "@contentual/content-engine-vocabulary";

/**
 * Pure state helpers for the conditions editor. Everything the component does to
 * a row lives here so the rules — which resets happen when, how a typed value is
 * parsed — are testable without React or a browser.
 */
export interface ConditionRow {
  source?: unknown;
  field?: unknown;
  operator?: unknown;
  value?: unknown;
  id?: string;
}

export interface FieldChoice {
  label: string;
  type: FieldType;
  value: string;
}

export interface FieldChoiceGroup {
  label: string;
  options: FieldChoice[];
}

const CHOICE_SEPARATOR = ":";

const groupLabels = {
  [conditionSourceTokens.event]: "Event fields",
  [conditionSourceTokens.user]: "User attributes",
} as const;

// A dropdown option value is a single string, but a condition is identified by
// source *and* field — an event payload field and a user attribute may share a
// name. Encoding both keeps the selection unambiguous.
export function encodeFieldChoice(source: string, field: string): string {
  return `${source}${CHOICE_SEPARATOR}${field}`;
}

export function decodeFieldChoice(
  value: string,
): { source: string; field: string } | null {
  const separatorIndex = value.indexOf(CHOICE_SEPARATOR);

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  return {
    source: value.slice(0, separatorIndex),
    field: value.slice(separatorIndex + 1),
  };
}

function optionsFor(event: unknown): readonly RuleFieldOption[] {
  const parsed = eventNameSchema.safeParse(event);

  return parsed.success ? fieldsForEvent(parsed.data) : [];
}

export function fieldChoiceGroups(event: unknown): FieldChoiceGroup[] {
  const options = optionsFor(event);

  return [conditionSourceTokens.event, conditionSourceTokens.user]
    .map((source) => ({
      label: groupLabels[source],
      options: options
        .filter((option) => option.source === source)
        .map((option) => ({
          label: option.field,
          type: option.type,
          value: encodeFieldChoice(option.source, option.field),
        })),
    }))
    .filter((group) => group.options.length > 0);
}

/** The catalogue definition of a row's selected field, or null if unselectable. */
export function fieldOptionFor(
  event: unknown,
  row: ConditionRow,
): RuleFieldOption | null {
  return (
    optionsFor(event).find(
      (option) => option.source === row.source && option.field === row.field,
    ) ?? null
  );
}

export function operatorChoicesFor(
  type: FieldType | null | undefined,
): readonly Operator[] {
  return type ? operatorsForFieldType(type) : [];
}

export function isListOperator(operator: unknown): boolean {
  const parsed = operatorSchema.safeParse(operator);

  return (
    parsed.success &&
    operatorDefinitions[parsed.data].valueCardinality === "list"
  );
}

export function emptyRow(): ConditionRow {
  return {
    source: undefined,
    field: undefined,
    operator: undefined,
    value: undefined,
  };
}

export function addRow(rows: readonly ConditionRow[]): ConditionRow[] {
  return [...rows, emptyRow()];
}

export function removeRow(
  rows: readonly ConditionRow[],
  index: number,
): ConditionRow[] {
  return rows.filter((_row, rowIndex) => rowIndex !== index);
}

// A new field can have a different type, so any operator or value chosen for the
// previous field may now be invalid. Clearing both is the only safe reset.
export function withField(
  row: ConditionRow,
  event: unknown,
  choiceValue: string,
): ConditionRow {
  const choice = decodeFieldChoice(choiceValue);

  if (!choice) {
    return { ...row, ...emptyRow() };
  }

  return {
    ...row,
    source: choice.source,
    field: choice.field,
    operator: undefined,
    value: undefined,
  };
}

// Switching between a scalar and a list operator changes what a value even is,
// so the value is reset only across that boundary — eq → neq keeps it.
export function withOperator(
  row: ConditionRow,
  _event: unknown,
  operator: string,
): ConditionRow {
  const wasList = isListOperator(row.operator);
  const isList = isListOperator(operator);

  if (wasList === isList) {
    return { ...row, operator };
  }

  return { ...row, operator, value: isList ? [] : undefined };
}

// The editor never hands the server a value of the wrong type: an input that
// cannot be read as the field's type leaves the value unset instead.
function parseTyped(type: FieldType, input: string): unknown {
  if (input === "") {
    return undefined;
  }

  if (type === "number") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (type === "boolean") {
    if (input === "true") {
      return true;
    }

    return input === "false" ? false : undefined;
  }

  return input;
}

export function withScalarValue(
  row: ConditionRow,
  event: unknown,
  input: string,
): ConditionRow {
  const option = fieldOptionFor(event, row);

  if (!option) {
    return row;
  }

  return { ...row, value: parseTyped(option.type, input) };
}

function listOf(row: ConditionRow): unknown[] {
  return Array.isArray(row.value) ? [...row.value] : [];
}

export function withListEntryAdded(row: ConditionRow): ConditionRow {
  return { ...row, value: [...listOf(row), ""] };
}

export function withListEntryRemoved(
  row: ConditionRow,
  index: number,
): ConditionRow {
  return {
    ...row,
    value: listOf(row).filter((_entry, entryIndex) => entryIndex !== index),
  };
}

export function withListEntry(
  row: ConditionRow,
  event: unknown,
  index: number,
  input: string,
): ConditionRow {
  const option = fieldOptionFor(event, row);

  if (!option) {
    return row;
  }

  const entries = listOf(row);
  entries[index] = parseTyped(option.type, input);

  return { ...row, value: entries };
}

/**
 * Reconciles existing rows with a newly selected trigger event. A user attribute
 * is readable from every event, but an event payload field belongs to one event
 * only — leaving a stale one selected would produce a rule that cannot publish
 * and whose editor row looks fine.
 */
export function rowsForEvent(
  rows: readonly ConditionRow[],
  event: unknown,
): ConditionRow[] {
  const parsed = eventNameSchema.safeParse(event);

  if (!parsed.success) {
    return [...rows];
  }

  return rows.map((row) =>
    row.source === conditionSourceTokens.event && !fieldOptionFor(event, row)
      ? { ...row, ...emptyRow() }
      : row,
  );
}
