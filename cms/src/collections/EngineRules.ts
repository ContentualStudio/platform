import type { CollectionConfig, OptionObject } from "payload";

import {
  authorableEffectTypes,
  dedupeScopes,
  effectTypeTokens,
  eventNames,
} from "@contentual/content-engine-vocabulary";

import { contentSyncHooks } from "../content-sync/hooks";
import { lockKeyOnceSet } from "./engine-key-access";
import { ruleFieldNames } from "../content-engine/rule-authoring";
import { validateEngineRuleBeforePublish } from "../content-engine/rule-publish-hook";

// Option lists are mapped from the vocabulary tuples rather than restated, so a
// vocabulary change reaches the authoring UI without a second edit here.
const optionsFrom = (values: readonly string[]): OptionObject[] =>
  values.map((value) => ({ label: value, value }));

// Effect targets must be real, live documents. Payload still validates the
// relationship itself; this only keeps the dropdown honest.
const publishedAndActive = () => ({
  active: { equals: true },
  _status: { equals: "published" },
});

// `effectType` is a top-level field, so it is read from `data` (the whole
// document). Payload only guarantees `siblingData` equals `data` for fields
// nested in a group; for a top-level field a render can hand this an empty
// siblingData, which would hide every effect-parameter field and make the
// message, badge, call-type, and programme targets unreachable.
const shownForEffects =
  (...effects: readonly string[]) =>
  (data: Record<string, unknown> | undefined) =>
    effects.includes(String(data?.effectType));

export const EngineRules: CollectionConfig = {
  slug: "engine-rules",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "triggerEvent", "active", "status", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: {
    // Publication is gated first, so an invalid rule never reaches the mirror
    // queue the sync hooks feed.
    beforeValidate: [validateEngineRuleBeforePublish],
    ...contentSyncHooks("engine-rules"),
  },
  fields: [
    {
      name: "priority",
      type: "number",
      defaultValue: 100,
      required: true,
      min: 0,
      max: 2147483647,
      validate: (value: unknown) =>
        typeof value === "number" && Number.isInteger(value)
          ? true
          : "Priority must be an integer.",
      admin: {
        description:
          "Lower numbers win competing programme suggestions. Equal priorities use the stable rule ID.",
      },
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      // Stable handle for the mirrored rule; renaming it would detach the rule
      // from its firing history.
      name: "key",
      type: "text",
      required: true,
      unique: true,
      index: true,
      access: { update: lockKeyOnceSet },
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: ruleFieldNames.triggerEvent,
      type: "select",
      required: true,
      options: optionsFrom(eventNames),
      admin: {
        description:
          "The event that makes this rule eligible to fire. It also decides which fields the conditions can read.",
      },
    },
    {
      name: ruleFieldNames.conditions,
      // v1 conditions are a flat list combined with AND. Nested groups and OR
      // are deliberately out of scope.
      //
      // Stored as json, not as a Payload array. An array field keeps its data in
      // nested per-row form state and exposes only a row count through
      // `useField`, so a custom component that renders the whole list — with
      // dropdowns whose options depend on another field — cannot read or write
      // it through the field value. The list is also what the mirror stores
      // verbatim, so json is the shape this field actually has. The server
      // validates every row on publish, so nothing here is trusted.
      type: "json",
      defaultValue: [],
      admin: {
        components: {
          Field: "/components/RuleConditionsField#RuleConditionsField",
        },
        description: "All conditions must hold for the rule to fire.",
      },
    },
    {
      name: ruleFieldNames.effectType,
      type: "select",
      required: true,
      options: optionsFrom(authorableEffectTypes),
    },
    {
      name: ruleFieldNames.programme,
      type: "relationship",
      relationTo: "programmes",
      filterOptions: () => ({ _status: { equals: "published" } }),
      admin: {
        condition: shownForEffects(
          effectTypeTokens.suggestProgramme,
          effectTypeTokens.unlockProgramme,
        ),
      },
    },
    {
      name: ruleFieldNames.badge,
      type: "relationship",
      relationTo: "engine-badges",
      filterOptions: publishedAndActive,
      admin: {
        condition: shownForEffects(effectTypeTokens.awardBadge),
      },
    },
    {
      name: ruleFieldNames.callType,
      type: "relationship",
      relationTo: "engine-call-types",
      filterOptions: publishedAndActive,
      admin: {
        condition: shownForEffects(effectTypeTokens.promptCall),
      },
    },
    {
      name: ruleFieldNames.message,
      type: "textarea",
      admin: {
        condition: shownForEffects(effectTypeTokens.inAppMessage),
      },
    },
    {
      name: ruleFieldNames.dedupeScope,
      type: "select",
      required: true,
      options: optionsFrom(dedupeScopes),
      admin: {
        description: "How often this rule may fire for the same user.",
      },
    },
    {
      // Publishing makes a rule real; activating makes it fire. Keeping them
      // separate lets an operator stage a rule and switch it on deliberately.
      name: ruleFieldNames.active,
      type: "checkbox",
      required: true,
      defaultValue: false,
    },
  ],
};
