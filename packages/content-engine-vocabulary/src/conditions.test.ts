import assert from "node:assert/strict";
import test from "node:test";

import { validateCondition } from "./conditions";

test("accepts an event field declared by the selected event", () => {
  assert.deepEqual(
    validateCondition("task.skipped", {
      source: "event",
      field: "consecutiveSkipCount",
      operator: "gte",
      value: 2,
    }),
    { valid: true, fieldType: "number" },
  );
});

test("rejects an event field declared only by another event", () => {
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "event",
      field: "consecutiveSkipCount",
      operator: "gte",
      value: 2,
    }),
    {
      valid: false,
      reason: "consecutiveSkipCount is not readable from task.completed",
    },
  );
});

test("accepts exactly allowlisted user attributes", () => {
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "user",
      field: "is_founding_creator",
      operator: "eq",
      value: true,
    }),
    { valid: true, fieldType: "boolean" },
  );
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "user",
      field: "email",
      operator: "eq",
      value: "person@example.com",
    }),
    { valid: false, reason: "email is not an allowed user attribute" },
  );
});

test("rejects invalid operators and value shapes", () => {
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "user",
      field: "subscription_status",
      operator: "gte",
      value: "pro",
    }),
    { valid: false, reason: "gte is not valid for string fields" },
  );
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "user",
      field: "programmes_completed",
      operator: "in",
      value: 2,
    }),
    { valid: false, reason: "in requires a list value" },
  );
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "user",
      field: "programmes_completed",
      operator: "contains",
      value: 2,
    }),
    { valid: false, reason: "contains is not a known operator" },
  );
});

test("rejects unknown events and condition sources", () => {
  assert.deepEqual(
    validateCondition("post.viral", {
      source: "event",
      field: "views",
      operator: "gte",
      value: 1000,
    }),
    { valid: false, reason: "post.viral is not a known event" },
  );
  assert.deepEqual(
    validateCondition("task.completed", {
      source: "profile",
      field: "user_type",
      operator: "eq",
      value: "creator",
    }),
    { valid: false, reason: "profile is not a known condition source" },
  );
});
