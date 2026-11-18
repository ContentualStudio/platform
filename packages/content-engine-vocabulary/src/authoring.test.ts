import assert from "node:assert/strict";
import test from "node:test";

import {
  effectTypes,
  userAttributeNames,
  type EventName,
  type Operator,
} from "./catalogue";
import {
  authorableEffectTypes,
  fieldsForEvent,
  operatorsForFieldType,
} from "./authoring";

const userFieldsOf = (event: EventName) =>
  fieldsForEvent(event)
    .filter((option) => option.source === "user")
    .map((option) => option.field);

const eventFieldsOf = (event: EventName) =>
  fieldsForEvent(event)
    .filter((option) => option.source === "event")
    .map((option) => option.field);

test("offers the selected event's payload fields with source and type", () => {
  assert.deepEqual(
    fieldsForEvent("task.skipped").filter(
      (option) => option.source === "event",
    ),
    [
      { source: "event", field: "userId", type: "string" },
      { source: "event", field: "programmeId", type: "string" },
      { source: "event", field: "taskId", type: "string" },
      { source: "event", field: "consecutiveSkipCount", type: "number" },
    ],
  );
});

test("does not offer another event's payload fields", () => {
  assert.equal(
    eventFieldsOf("task.completed").includes("consecutiveSkipCount"),
    false,
  );
  assert.equal(eventFieldsOf("task.completed").includes("contentType"), true);
});

test("offers all six user attributes for every event", () => {
  for (const event of ["task.completed", "streak.resumed"] as const) {
    assert.deepEqual(userFieldsOf(event), [...userAttributeNames]);
  }
});

test("types user attribute options from the catalogue", () => {
  const options = fieldsForEvent("streak.resumed");

  assert.deepEqual(
    options.find((option) => option.field === "is_founding_creator"),
    { source: "user", field: "is_founding_creator", type: "boolean" },
  );
  assert.deepEqual(
    options.find((option) => option.field === "programmes_completed"),
    { source: "user", field: "programmes_completed", type: "number" },
  );
});

test("allows ordering operators only on number fields", () => {
  const expectedForNumbers: Operator[] = ["eq", "neq", "in", "gte", "lte"];

  assert.deepEqual([...operatorsForFieldType("number")], expectedForNumbers);
  assert.deepEqual([...operatorsForFieldType("string")], ["eq", "neq", "in"]);
  assert.deepEqual([...operatorsForFieldType("boolean")], ["eq", "neq", "in"]);
});

test("excludes only grant_call from the authorable effects", () => {
  assert.equal(authorableEffectTypes.length, 5);
  assert.deepEqual(
    [...authorableEffectTypes],
    effectTypes.filter((effect) => effect !== "grant_call"),
  );
});
