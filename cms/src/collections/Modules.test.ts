import assert from "node:assert/strict";
import test from "node:test";
import type { Field } from "payload";

import { Modules } from "./Modules";

type FieldConfig = Record<string, unknown> & { type: string };

function fieldNamed(name: string): FieldConfig {
  const field = Modules.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `modules is missing the ${name} field`);
  return field as unknown as FieldConfig;
}

test("defines an ordered module with programme and lesson relationships", () => {
  assert.equal(fieldNamed("title").type, "text");
  assert.equal(fieldNamed("order").type, "number");
  assert.equal(fieldNamed("programme").relationTo, "programmes");
  assert.equal(fieldNamed("lessons").relationTo, "lessons");
  assert.equal(fieldNamed("lessons").hasMany, true);
});

test("keeps draft versions and the content mirror hooks", () => {
  assert.ok(
    Modules.versions &&
      typeof Modules.versions === "object" &&
      "drafts" in Modules.versions,
  );
  assert.equal(Modules.hooks?.afterChange?.length, 1);
  assert.equal(Modules.hooks?.afterDelete?.length, 1);
  assert.equal(Modules.hooks?.beforeValidate?.length, 1);
});
