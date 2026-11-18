import type { CollectionConfig } from "payload";
import { contentSyncHooks } from "../content-sync/hooks";
import { lockKeyOnceSet } from "./engine-key-access";

// The closed set of call types a `prompt_call` rule may target. Mirrored for the
// same reason as badges: the effect handler resolves the target locally.
export const EngineCallTypes: CollectionConfig = {
  slug: "engine-call-types",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "key", "active", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: contentSyncHooks("engine-call-types"),
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      // Immutable for the same reason as the badge key: rules and mirrored rows
      // resolve targets through it.
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
      name: "active",
      type: "checkbox",
      required: true,
      defaultValue: true,
    },
  ],
};
