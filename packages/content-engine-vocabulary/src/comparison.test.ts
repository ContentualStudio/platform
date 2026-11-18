import assert from "node:assert/strict";
import test from "node:test";

import { compareConditionValue } from "./comparison";

test("eq and neq compare scalar values without coercion", () => {
  assert.deepEqual(
    compareConditionValue({ actual: 3, expected: 3, fieldType: "number", operator: "eq" }),
    { valid: true, matches: true },
  );
  assert.deepEqual(
    compareConditionValue({ actual: "3", expected: 3, fieldType: "number", operator: "eq" }),
    { valid: false, reason: "actual value must be a number" },
  );
  assert.deepEqual(
    compareConditionValue({ actual: true, expected: false, fieldType: "boolean", operator: "neq" }),
    { valid: true, matches: true },
  );
});

test("in evaluates membership and requires a typed list", () => {
  assert.deepEqual(
    compareConditionValue({
      actual: "creator",
      expected: ["creator", "brand"],
      fieldType: "string",
      operator: "in",
    }),
    { valid: true, matches: true },
  );
  assert.deepEqual(
    compareConditionValue({
      actual: "creator",
      expected: "creator",
      fieldType: "string",
      operator: "in",
    }),
    { valid: false, reason: "in requires a list value" },
  );
  assert.deepEqual(
    compareConditionValue({
      actual: 2,
      expected: [1, "2"],
      fieldType: "number",
      operator: "in",
    }),
    { valid: false, reason: "expected values must all be numbers" },
  );
});

test("gte and lte compare numbers", () => {
  assert.deepEqual(
    compareConditionValue({ actual: 10, expected: 7, fieldType: "number", operator: "gte" }),
    { valid: true, matches: true },
  );
  assert.deepEqual(
    compareConditionValue({ actual: 10, expected: 10, fieldType: "number", operator: "lte" }),
    { valid: true, matches: true },
  );
  assert.deepEqual(
    compareConditionValue({ actual: 11, expected: 10, fieldType: "number", operator: "lte" }),
    { valid: true, matches: false },
  );
});

test("gte and lte reject non-comparable field types", () => {
  assert.deepEqual(
    compareConditionValue({ actual: "pro", expected: "free", fieldType: "string", operator: "gte" }),
    { valid: false, reason: "gte is not valid for string fields" },
  );
  assert.deepEqual(
    compareConditionValue({ actual: true, expected: false, fieldType: "boolean", operator: "lte" }),
    { valid: false, reason: "lte is not valid for boolean fields" },
  );
});

test("a missing actual field has the defined result false", () => {
  assert.deepEqual(
    compareConditionValue({ actual: undefined, expected: 3, fieldType: "number", operator: "eq" }),
    { valid: true, matches: false },
  );
  assert.deepEqual(
    compareConditionValue({ actual: null, expected: [1, 2], fieldType: "number", operator: "in" }),
    { valid: true, matches: false },
  );
});

test("single-value operators reject list values", () => {
  assert.deepEqual(
    compareConditionValue({ actual: 2, expected: [2], fieldType: "number", operator: "eq" }),
    { valid: false, reason: "eq requires a single value" },
  );
});
