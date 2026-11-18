import assert from "node:assert/strict";
import test from "node:test";
import { matchingOperatorTokens } from "@contentual/programme-matching-vocabulary";
import {
  addRule,
  changeConditionField,
  createCondition,
  createRule,
  reorderRules,
  ruleMoveAvailability,
  ruleFromValue,
  setConditionValues,
} from "./rule-editor";

test("an existing bare numeric programme relationship survives editing", () => {
  assert.equal(ruleFromValue({ programme: 42 }, 0).programme, "42");
});

test("condition controls follow the selected vocabulary field", () => {
  const condition = createCondition("primaryPlatform");
  assert.equal(condition.operator, "equals");
  assert.deepEqual(condition.acceptedValues, []);

  const selected = changeConditionField(
    createRule(0),
    0,
    "weeklyCommitment",
  );
  assert.equal(selected.conditions[0]?.field, "weeklyCommitment");
  assert.deepEqual(selected.conditions[0]?.acceptedValues, []);
  assert.deepEqual(
    setConditionValues(selected, 0, [3]).conditions[0]?.acceptedValues,
    [3],
  );
  assert.equal(
    changeConditionField(createRule(0), 0, "weeklyCommitment").conditions[0]
      ?.operator,
    matchingOperatorTokens.equals,
  );
});

test("reordering rewrites unique priorities and keeps fallback last", () => {
  const first = createRule(0);
  const second = createRule(1);
  const fallback = { ...createRule(2), fallback: true, priority: null };
  const reordered = reorderRules([first, second, fallback], 1, 0);

  assert.deepEqual(
    reordered.map((rule) => rule.id),
    [second.id, first.id, fallback.id],
  );
  assert.deepEqual(
    reordered.map((rule) => rule.priority),
    [2, 1, null],
  );
});

test("adding a rule gives it an evaluator-shaped condition", () => {
  const rules = addRule(addRule([], 0), 1);
  assert.equal(rules.length, 2);
  assert.equal(rules[0]?.fallback, false);
  assert.equal(rules[0]?.conditions.length, 1);
  assert.equal(rules[0]?.conditions[0]?.operator, "equals");
  assert.deepEqual(
    rules.map((rule) => rule.priority),
    [2, 1],
    "the visible order is the evaluator's descending priority order",
  );
});

test("adding a normal rule inserts it before an existing fallback", () => {
  const normal = createRule(0);
  const fallback = { ...createRule(1), fallback: true, priority: null };
  const rules = addRule([normal, fallback], 2);

  assert.deepEqual(
    rules.map((rule) => rule.fallback),
    [false, false, true],
  );
  assert.deepEqual(
    rules.map((rule) => rule.priority),
    [2, 1, null],
  );
});

test("priority controls move the first rule down but never cross the fallback", () => {
  const rules = [
    createRule(0),
    createRule(1),
    { ...createRule(2), fallback: true },
  ];

  assert.deepEqual(ruleMoveAvailability(rules, 0), {
    up: false,
    down: true,
  });
  assert.deepEqual(ruleMoveAvailability(rules, 1), {
    up: true,
    down: false,
  });
  assert.deepEqual(ruleMoveAvailability(rules, 2), {
    up: false,
    down: false,
  });
});
