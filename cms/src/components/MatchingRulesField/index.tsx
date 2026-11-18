"use client";

import {
  acceptedValuesFor,
  fieldDefinition,
  matchingFields,
  operatorsFor,
  type MatchingField,
  type MatchingOperator,
} from "@contentual/programme-matching-vocabulary";
import { FieldLabel, useField } from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import React from "react";
import {
  addCondition,
  addRule,
  changeConditionField,
  changeConditionOperator,
  removeCondition,
  reorderRules,
  ruleMoveAvailability,
  ruleFromValue,
  valueCardinality,
  type EditableCondition,
  type EditableRule,
} from "./rule-editor";
import {
  loadPublishedProgrammeOptions,
  type ProgrammeOption,
} from "./programme-options";
import "./index.scss";

const RULES_CLASS = "matching-rules-field";

export const MatchingRulesField: JSONFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<unknown[]>({ path });
  const [programmes, setProgrammes] = React.useState<ProgrammeOption[]>([]);
  const [programmeError, setProgrammeError] = React.useState("");

  const rules = React.useMemo(
    () =>
      (Array.isArray(value) ? value : []).map((rule, index) =>
        ruleFromValue(rule, index),
      ),
    [value],
  );

  React.useEffect(() => {
    let cancelled = false;

    void loadPublishedProgrammeOptions()
      .then((options) => {
        if (cancelled) {
          return;
        }
        setProgrammes(options);
      })
      .catch(() => {
        if (!cancelled) {
          setProgrammeError(
            "Live programmes could not be loaded. Refresh the page before publishing.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const write = (next: readonly EditableRule[]) => setValue(next);

  return (
    <div className={RULES_CLASS}>
      <FieldLabel label={field?.label} path={path} />
      <p className={`${RULES_CLASS}__hint`}>
        Build rules from the same questions and answers onboarding collects. The
        list order is the priority order; the fallback is always last.
      </p>
      {programmeError ? (
        <p className={`${RULES_CLASS}__error`} role="alert">
          {programmeError}
        </p>
      ) : null}
      {rules.length === 0 ? (
        <p className={`${RULES_CLASS}__empty`}>No rules yet.</p>
      ) : null}
      <div className={`${RULES_CLASS}__list`}>
        {rules.map((rule, index) => {
          const movement = ruleMoveAvailability(rules, index);

          return (
            <RuleCard
              canMoveDown={movement.down}
              canMoveUp={movement.up}
              key={rule.id}
              index={index}
              rule={rule}
              programmes={programmes}
              onChange={(next) =>
                write(
                  rules.map((current, ruleIndex) =>
                    ruleIndex === index ? next : current,
                  ),
                )
              }
              onRemove={() =>
                write(rules.filter((_, ruleIndex) => ruleIndex !== index))
              }
              onMove={(to) => write(reorderRules(rules, index, to))}
            />
          );
        })}
      </div>
      <button
        className={`${RULES_CLASS}__button`}
        onClick={() => write(addRule(rules, rules.length))}
        type="button"
      >
        Add rule
      </button>
    </div>
  );
};

function RuleCard({
  canMoveDown,
  canMoveUp,
  index,
  onChange,
  onMove,
  onRemove,
  programmes,
  rule,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  index: number;
  onChange: (rule: EditableRule) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  programmes: ProgrammeOption[];
  rule: EditableRule;
}) {
  const fallback = rule.fallback;

  return (
    <fieldset className={`${RULES_CLASS}__rule`}>
      <legend>
        {index + 1}. {rule.name || "Untitled rule"}
      </legend>
      <div className={`${RULES_CLASS}__toolbar`}>
        <button
          disabled={!canMoveUp}
          onClick={() => onMove(index - 1)}
          type="button"
        >
          Move up
        </button>
        <button
          disabled={!canMoveDown}
          onClick={() => onMove(index + 1)}
          type="button"
        >
          Move down
        </button>
        <button onClick={onRemove} type="button">
          Remove rule
        </button>
      </div>
      <label>
        Rule name
        <input
          onChange={(event) => onChange({ ...rule, name: event.target.value })}
          value={rule.name}
        />
      </label>
      <label>
        Programme
        <select
          onChange={(event) => onChange({ ...rule, programme: event.target.value || null })}
          value={rule.programme ?? ""}
        >
          <option value="">Choose a live programme</option>
          {rule.programme && !programmes.some((programme) => programme.id === rule.programme) ? (
            <option value={rule.programme}>Current selection</option>
          ) : null}
          {programmes.map((programme) => (
            <option key={programme.id} value={programme.id}>
              {programme.title} ({programme.key})
            </option>
          ))}
        </select>
      </label>
      <label className={`${RULES_CLASS}__checkbox`}>
        <input
          checked={rule.active}
          disabled={fallback}
          onChange={(event) => onChange({ ...rule, active: event.target.checked })}
          type="checkbox"
        />
        Active
      </label>
      <label className={`${RULES_CLASS}__checkbox`}>
        <input
          checked={fallback}
          onChange={(event) => {
            const next = { ...rule, fallback: event.target.checked };
            onChange({
              ...next,
              priority: event.target.checked ? null : rule.priority ?? 1,
              conditions: event.target.checked ? [] : rule.conditions,
            });
          }}
          type="checkbox"
        />
        Fallback (everyone else)
      </label>
      <label>
        Priority
        <input disabled type="number" value={rule.priority ?? "—"} />
      </label>
      <label>
        Explanation shown to support
        <textarea
          onChange={(event) => onChange({ ...rule, explanation: event.target.value })}
          value={rule.explanation}
        />
      </label>
      {!fallback ? (
        <div className={`${RULES_CLASS}__conditions`}>
          <strong>All conditions must match</strong>
          {rule.conditions.map((condition, conditionIndex) => (
            <ConditionRow
              key={`${rule.id}-${conditionIndex}`}
              condition={condition}
              index={conditionIndex}
              onChange={(next) =>
                onChange({
                  ...rule,
                  conditions: rule.conditions.map((current, rowIndex) =>
                    rowIndex === conditionIndex ? next : current,
                  ),
                })
              }
              onRemove={() => onChange(removeCondition(rule, conditionIndex))}
            />
          ))}
          <button onClick={() => onChange(addCondition(rule))} type="button">
            Add condition
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
}: {
  condition: EditableCondition;
  index: number;
  onChange: (condition: EditableCondition) => void;
  onRemove: () => void;
}) {
  const choices = acceptedValuesFor(condition.field);
  const list = valueCardinality(condition.operator) === "list";
  const values = condition.acceptedValues.length ? condition.acceptedValues : [""];

  return (
    <div className={`${RULES_CLASS}__condition`}>
      <label>
        Question {index + 1}
        <select
          onChange={(event) =>
            onChange(
              changeConditionField(
                emptyRuleForCondition(condition),
                0,
                event.target.value as MatchingField,
              ).conditions[0],
            )
          }
          value={condition.field}
        >
          {matchingFields.map((field) => (
            <option key={field} value={field}>
              {fieldDefinition(field).label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Comparison
        <select
          onChange={(event) =>
              onChange(
                changeConditionOperator(
                  emptyRuleForCondition(condition),
                  0,
                  event.target.value as MatchingOperator,
                ).conditions[0],
              )
          }
          value={condition.operator}
        >
          {operatorsFor(condition.field).map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
      </label>
      <label>
        Accepted answer{list ? "s" : ""}
        <div className={`${RULES_CLASS}__values`}>
          {values.map((value, valueIndex) => (
            <ValueControl
              key={`${condition.field}-${valueIndex}`}
              choices={choices}
              value={value}
              onChange={(next) =>
                onChange({
                  ...condition,
                  acceptedValues: condition.acceptedValues.map((current, currentIndex) =>
                    currentIndex === valueIndex ? next : current,
                  ).length
                    ? condition.acceptedValues.map((current, currentIndex) =>
                        currentIndex === valueIndex ? next : current,
                      )
                    : [next],
                })
              }
            />
          ))}
        </div>
      </label>
      {list ? (
        <button
          onClick={() =>
            onChange({ ...condition, acceptedValues: [...condition.acceptedValues, ""] })
          }
          type="button"
        >
          Add answer
        </button>
      ) : null}
      <button onClick={onRemove} type="button">
        Remove condition
      </button>
    </div>
  );
}

function emptyRuleForCondition(condition: EditableCondition): EditableRule {
  return {
    id: "condition-edit",
    name: "",
    programme: null,
    active: true,
    priority: 1,
    fallback: false,
    explanation: "",
    conditions: [condition],
  };
}

function ValueControl({
  choices,
  onChange,
  value,
}: {
  choices: readonly string[];
  onChange: (value: string | number) => void;
  value: string | number;
}) {
  if (choices.length > 0) {
    return (
      <select onChange={(event) => onChange(event.target.value)} value={String(value)}>
        <option value="">Choose an answer</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      min={1}
      max={7}
      onChange={(event) => onChange(Number(event.target.value))}
      type="number"
      value={value === "" ? "" : String(value)}
    />
  );
}
