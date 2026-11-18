import assert from "node:assert/strict";
import test from "node:test";
import type { Field, OptionObject } from "payload";

import { Programmes } from "./Programmes";
import { preventProgrammeKeyChange } from "./programme-lifecycle";

type FieldConfig = Record<string, unknown> & { type: string };

function fieldNamed(name: string): FieldConfig {
  const field = Programmes.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `programmes is missing the ${name} field`);
  return field as unknown as FieldConfig;
}

test("contains the First Take programme authoring fields", () => {
  for (const name of [
    "durationDays",
    "experienceLevel",
    "difficulty",
    "track",
    "founderVideoUrl",
    "expectations",
    "ctaText",
    "milestones",
    "insightMoments",
  ]) {
    assert.ok(fieldNamed(name));
  }
});

test("uses the agreed programme enums without a second editable module list", () => {
  const values = (name: string) =>
    (fieldNamed(name).options as OptionObject[]).map((option) => option.value);

  assert.deepEqual(values("track"), [
    "starter",
    "grinder",
    "pro",
    "recovery",
    "smb",
    "keep_creating",
  ]);
  assert.deepEqual(values("experienceLevel"), [
    "beginner",
    "intermediate",
    "advanced",
  ]);
  assert.equal(
    Programmes.fields.some(
      (candidate) => "name" in candidate && candidate.name === "modules",
    ),
    false,
  );
});

test("uses the four insight moment trigger types", () => {
  const insightMoments = fieldNamed("insightMoments") as FieldConfig & {
    fields: FieldConfig[];
  };
  const triggerType = insightMoments.fields.find(
    (field) => field.name === "triggerType",
  ) as FieldConfig & { options?: OptionObject[] };

  assert.equal(triggerType.type, "select");
  assert.deepEqual(
    triggerType.options?.map((option) => option.value),
    ["day", "task_completed", "week_completed", "three_consecutive_skipped_days"],
  );
});

test("requires integer programme duration and milestone trigger days", () => {
  const durationDays = fieldNamed("durationDays") as FieldConfig & {
    validate?: (value: unknown) => true | string;
  };
  const milestones = fieldNamed("milestones") as FieldConfig & {
    fields: FieldConfig[];
  };
  const triggerDay = milestones.fields.find(
    (field) => field.name === "triggerDay",
  ) as FieldConfig & { validate?: (value: unknown) => true | string };

  assert.equal(durationDays.validate?.(21), true);
  assert.match(String(durationDays.validate?.(21.5)), /positive integer/);
  assert.equal(triggerDay.validate?.(7), true);
  assert.match(String(triggerDay.validate?.(7.5)), /positive integer/);
});

test("keeps draft versions, eligibility synchronization and content mirror hooks", () => {
  assert.ok(
    Programmes.versions &&
      typeof Programmes.versions === "object" &&
      "drafts" in Programmes.versions,
  );
  assert.equal(Programmes.hooks?.afterChange?.length, 2);
  assert.equal(Programmes.hooks?.afterDelete?.length, 1);
});

test("programme key changes are refused even when field access is overridden", async () => {
  await assert.rejects(
    preventProgrammeKeyChange({
      data: { key: "replacement" },
      originalDoc: { id: 1, key: "original" },
    } as never),
    /cannot be changed/,
  );
});

test("programmes expose an immutable key and explicit lifecycle", () => {
  const key = fieldNamed("key") as FieldConfig & {
    access?: { update?: unknown };
    unique?: boolean;
  };
  const lifecycle = fieldNamed("lifecycleStatus") as FieldConfig & {
    options?: OptionObject[];
  };

  assert.equal(key.unique, true);
  assert.equal(typeof key.access?.update, "function");
  assert.deepEqual(
    lifecycle.options?.map((option) => option.value),
    ["draft", "live", "retired", "archived"],
  );
  assert.ok((Programmes.hooks?.beforeDelete?.length ?? 0) > 0);
  assert.ok((Programmes.hooks?.beforeChange?.length ?? 0) > 0);
});
