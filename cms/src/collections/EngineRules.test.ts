import assert from "node:assert/strict";
import test from "node:test";
import type { Field, OptionObject } from "payload";

import {
  authorableEffectTypes,
  dedupeScopes,
  effectTypeTokens,
  eventNames,
} from "@contentual/content-engine-vocabulary";

import { EngineRules } from "./EngineRules";

// Payload's Field union does not narrow by name, and these assertions are about
// config data rather than types, so the located field is read as a record.
type FieldConfig = Record<string, unknown> & { type: string };

function fieldNamed(name: string): FieldConfig {
  const field = EngineRules.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `engine-rules is missing the ${name} field`);
  return field as unknown as FieldConfig;
}

function optionValues(name: string): string[] {
  const field = fieldNamed(name);

  assert.equal(field.type, "select");
  return (field.options as OptionObject[]).map((option) => option.value);
}

test("no longer stores a free-form rules blob", () => {
  const names = EngineRules.fields
    .filter((field): field is Extract<Field, { name: string }> => "name" in field)
    .map((field) => field.name);

  assert.equal(names.includes("rules"), false);
  // The identity fields survive the schema replacement.
  assert.deepEqual(
    ["name", "key", "description"].filter((name) => names.includes(name)),
    ["name", "key", "description"],
  );
});

test("locks the key once it has a value but not before", () => {
  const key = fieldNamed("key");
  const access = key.access as
    | { update?: (args: { doc?: Record<string, unknown> }) => boolean }
    | undefined;

  assert.equal(key.unique, true);
  // With drafts.autosave, the document is created the moment the form is
  // touched, so a key that were locked from creation could never be filled in.
  // It stays editable while empty and locks once set.
  assert.equal(access?.update?.({ doc: {} }), true);
  assert.equal(access?.update?.({ doc: { key: "" } }), true);
  assert.equal(access?.update?.({ doc: { key: "welcome-nudge" } }), false);
});

test("sources every select's options from the vocabulary", () => {
  assert.deepEqual(optionValues("triggerEvent"), [...eventNames]);
  assert.deepEqual(optionValues("dedupeScope"), [...dedupeScopes]);

  // grant_call is a real vocabulary token but cannot be authored in v1, so it
  // must not be offered at all.
  assert.deepEqual(optionValues("effectType"), [...authorableEffectTypes]);
  assert.equal(
    optionValues("effectType").includes(effectTypeTokens.grantCall),
    false,
  );
});

test("renders conditions through the dependent editor component", () => {
  const conditions = fieldNamed("conditions");
  const admin = conditions.admin as
    | { components?: { Field?: unknown } }
    | undefined;

  // Deliberately json rather than array: a Payload array keeps its data in
  // nested row form state and exposes only a row count through `useField`, so a
  // custom component that owns the whole list must hold the list itself.
  assert.equal(conditions.type, "json");
  assert.deepEqual(conditions.defaultValue, []);
  assert.match(String(admin?.components?.Field), /RuleConditionsField/);
});

test("shows each effect parameter only for the effects that use it", () => {
  // Payload passes the top-level document as the first `data` argument; the
  // second `siblingData` argument is only the same object for top-level fields
  // in some render paths, so the condition must read `data`. Passing effectType
  // only through `data` here is what proves that.
  const shows = (fieldName: string, effectType: string) => {
    const admin = fieldNamed(fieldName).admin as
      | {
          condition?: (
            data: Record<string, unknown>,
            siblingData: Record<string, unknown>,
          ) => boolean;
        }
      | undefined;

    return admin?.condition?.({ effectType }, {}) === true;
  };

  assert.equal(shows("programme", effectTypeTokens.suggestProgramme), true);
  assert.equal(shows("programme", effectTypeTokens.unlockProgramme), true);
  assert.equal(shows("programme", effectTypeTokens.awardBadge), false);

  assert.equal(shows("badge", effectTypeTokens.awardBadge), true);
  assert.equal(shows("badge", effectTypeTokens.promptCall), false);

  assert.equal(shows("callType", effectTypeTokens.promptCall), true);
  assert.equal(shows("callType", effectTypeTokens.awardBadge), false);

  assert.equal(shows("message", effectTypeTokens.inAppMessage), true);
  assert.equal(shows("message", effectTypeTokens.promptCall), false);
});

test("points each effect relationship at its own catalogue", () => {
  assert.equal(fieldNamed("programme").relationTo, "programmes");
  assert.equal(fieldNamed("badge").relationTo, "engine-badges");
  assert.equal(fieldNamed("callType").relationTo, "engine-call-types");
});

test("offers only published active documents as effect targets", () => {
  for (const name of ["badge", "callType"]) {
    const filterOptions = fieldNamed(name).filterOptions as
      | (() => unknown)
      | undefined;

    assert.equal(typeof filterOptions, "function");
    assert.deepEqual(filterOptions?.(), {
      active: { equals: true },
      _status: { equals: "published" },
    });
  }
});

test("defaults a new rule to inactive", () => {
  const active = fieldNamed("active");

  assert.equal(active.type, "checkbox");
  assert.equal(active.defaultValue, false);
});

test("keeps drafts and combines validation with the content sync hooks", () => {
  assert.ok(
    EngineRules.versions &&
      typeof EngineRules.versions === "object" &&
      EngineRules.versions.drafts,
  );
  assert.equal(EngineRules.hooks?.beforeValidate?.length, 1);
  assert.equal(EngineRules.hooks?.afterChange?.length, 1);
  assert.equal(EngineRules.hooks?.afterDelete?.length, 1);
});
