import assert from "node:assert/strict";
import test from "node:test";
import type { Field, OptionObject } from "payload";

import { Tasks } from "./Tasks";

type FieldConfig = Record<string, unknown> & { type: string };

function fieldNamed(name: string): FieldConfig {
  const field = Tasks.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `tasks is missing the ${name} field`);
  return field as unknown as FieldConfig;
}

test("contains the programme, module, and schedule fields", () => {
  for (const name of [
    "programme",
    "module",
    "dayNumber",
    "orderWithinDay",
    "dayType",
    "timeEstimateMinutes",
    "publishSlot",
    "postNumber",
    "pausePrompt",
    "outputDescription",
    "contentType",
  ]) {
    assert.ok(fieldNamed(name));
  }

  assert.equal(fieldNamed("programme").relationTo, "programmes");
  assert.equal(fieldNamed("module").relationTo, "modules");
});

test("uses the four authored task content types", () => {
  const field = fieldNamed("contentType");
  assert.equal(field.type, "select");
  assert.deepEqual(
    (field.options as OptionObject[]).map((option) => option.value),
    ["video", "photo", "caption", "story"],
  );
});

test("uses Push, Protect, and Recharge as the only day types", () => {
  const field = fieldNamed("dayType");
  assert.equal(field.type, "select");
  assert.deepEqual(
    (field.options as OptionObject[]).map((option) => option.value),
    ["push", "protect", "recharge"],
  );
});

test("keeps draft versions and the content mirror hooks", () => {
  assert.ok(
    Tasks.versions &&
      typeof Tasks.versions === "object" &&
      "drafts" in Tasks.versions,
  );
  assert.equal(Tasks.hooks?.afterChange?.length, 1);
  assert.equal(Tasks.hooks?.afterDelete?.length, 1);
  assert.equal(Tasks.hooks?.beforeValidate?.length, 1);
});
