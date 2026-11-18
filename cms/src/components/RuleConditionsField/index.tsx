"use client";

import { FieldLabel, useField, useFormFields } from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import React from "react";

import {
  addRow,
  encodeFieldChoice,
  fieldChoiceGroups,
  fieldOptionFor,
  isListOperator,
  operatorChoicesFor,
  removeRow,
  rowsForEvent,
  withField,
  withListEntry,
  withListEntryAdded,
  withListEntryRemoved,
  withOperator,
  withScalarValue,
  type ConditionRow,
} from "./condition-editor";

import "./index.scss";

const BASE_CLASS = "rule-conditions";

/**
 * The conditions editor. Every control it offers is derived from the selected
 * trigger event and the shared vocabulary, so an author cannot compose a
 * condition the evaluator would not understand. The server still validates on
 * publish — this component is a guide, not the trust boundary.
 */
export const RuleConditionsField: JSONFieldClientComponent = ({ field, path }) => {
  const { setValue, value } = useField<ConditionRow[]>({ path });

  // Subscribing to the single field keeps a keystroke elsewhere in the form from
  // re-rendering the whole editor.
  const triggerEvent = useFormFields(
    ([fields]) => fields?.triggerEvent?.value as string | undefined,
  );

  const rows = React.useMemo<ConditionRow[]>(
    () => (Array.isArray(value) ? value : []),
    [value],
  );
  const groups = React.useMemo(
    () => fieldChoiceGroups(triggerEvent),
    [triggerEvent],
  );

  // Changing the trigger can invalidate a selected event field. Reconciling here
  // keeps what the author sees identical to what will be saved.
  React.useEffect(() => {
    const reconciled = rowsForEvent(rows, triggerEvent);

    if (reconciled.some((row, index) => row !== rows[index])) {
      setValue(reconciled);
    }
  }, [rows, setValue, triggerEvent]);

  const updateRow = (index: number, row: ConditionRow) => {
    setValue(rows.map((existing, rowIndex) => (rowIndex === index ? row : existing)));
  };

  if (!triggerEvent) {
    return (
      <div className={BASE_CLASS}>
        <FieldLabel label={field?.label} path={path} />
        <p className={`${BASE_CLASS}__empty`}>
          Choose a trigger event first — it decides which fields a condition can
          read.
        </p>
      </div>
    );
  }

  return (
    <div className={BASE_CLASS}>
      <FieldLabel label={field?.label} path={path} />
      <p className={`${BASE_CLASS}__hint`}>
        All conditions must hold for the rule to fire.
      </p>

      {rows.length === 0 ? (
        <p className={`${BASE_CLASS}__empty`}>
          No conditions. The rule fires on every {triggerEvent} event.
        </p>
      ) : null}

      {rows.map((row, index) => {
        const option = fieldOptionFor(triggerEvent, row);
        const operators = operatorChoicesFor(option?.type);
        const rowId = `${path}-${index}`;
        const listMode = isListOperator(row.operator);
        const entries = Array.isArray(row.value) ? row.value : [];

        return (
          <fieldset className={`${BASE_CLASS}__row`} key={row.id ?? rowId}>
            <legend className={`${BASE_CLASS}__legend`}>
              Condition {index + 1}
            </legend>

            <div className={`${BASE_CLASS}__control`}>
              <label htmlFor={`${rowId}-field`}>Field</label>
              <select
                id={`${rowId}-field`}
                onChange={(event) =>
                  updateRow(index, withField(row, triggerEvent, event.target.value))
                }
                value={
                  option
                    ? encodeFieldChoice(option.source, option.field)
                    : ""
                }
              >
                <option value="">Select a field</option>
                {groups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className={`${BASE_CLASS}__control`}>
              <label htmlFor={`${rowId}-operator`}>Operator</label>
              <select
                disabled={!option}
                id={`${rowId}-operator`}
                onChange={(event) =>
                  updateRow(
                    index,
                    withOperator(row, triggerEvent, event.target.value),
                  )
                }
                value={typeof row.operator === "string" ? row.operator : ""}
              >
                <option value="">Select an operator</option>
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </div>

            <div className={`${BASE_CLASS}__control`}>
              <label htmlFor={`${rowId}-value`}>Value</label>

              {!option || !row.operator ? (
                <p className={`${BASE_CLASS}__error`}>
                  Select a field and an operator to enter a value.
                </p>
              ) : listMode ? (
                <div className={`${BASE_CLASS}__list`}>
                  {entries.map((entry, entryIndex) => (
                    <div
                      className={`${BASE_CLASS}__entry`}
                      key={`${rowId}-entry-${entryIndex}`}
                    >
                      <ValueInput
                        id={
                          entryIndex === 0
                            ? `${rowId}-value`
                            : `${rowId}-value-${entryIndex}`
                        }
                        onChange={(next) =>
                          updateRow(
                            index,
                            withListEntry(row, triggerEvent, entryIndex, next),
                          )
                        }
                        type={option.type}
                        value={entry}
                      />
                      <button
                        onClick={() =>
                          updateRow(index, withListEntryRemoved(row, entryIndex))
                        }
                        type="button"
                      >
                        Remove value
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => updateRow(index, withListEntryAdded(row))}
                    type="button"
                  >
                    Add value
                  </button>
                </div>
              ) : (
                <ValueInput
                  id={`${rowId}-value`}
                  onChange={(next) =>
                    updateRow(index, withScalarValue(row, triggerEvent, next))
                  }
                  type={option.type}
                  value={row.value}
                />
              )}
            </div>

            <button
              className={`${BASE_CLASS}__remove`}
              onClick={() => setValue(removeRow(rows, index))}
              type="button"
            >
              Remove condition {index + 1}
            </button>
          </fieldset>
        );
      })}

      <button
        className={`${BASE_CLASS}__add`}
        onClick={() => setValue(addRow(rows))}
        type="button"
      >
        Add condition
      </button>
    </div>
  );
};

// Booleans get an explicit true/false select rather than a checkbox, so "unset"
// stays distinguishable from "false".
function ValueInput({
  id,
  onChange,
  type,
  value,
}: {
  id: string;
  onChange: (value: string) => void;
  type: "boolean" | "number" | "string";
  value: unknown;
}) {
  const text = value === undefined || value === null ? "" : String(value);

  if (type === "boolean") {
    return (
      <select id={id} onChange={(event) => onChange(event.target.value)} value={text}>
        <option value="">Select a value</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  return (
    <input
      id={id}
      onChange={(event) => onChange(event.target.value)}
      type={type === "number" ? "number" : "text"}
      value={text}
    />
  );
}
