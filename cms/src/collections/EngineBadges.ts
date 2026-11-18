import type { CollectionConfig } from "payload";
import { contentSyncHooks } from "../content-sync/hooks";
import { lockKeyOnceSet } from "./engine-key-access";

// The closed set of badges an `award_badge` rule may target. Rules point at
// these documents by relationship, and the mirror stores the row so an effect
// handler can resolve a badge without calling Payload.
export const EngineBadges: CollectionConfig = {
  slug: "engine-badges",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "key", "active", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: contentSyncHooks("engine-badges"),
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      // The stable handle runtime code matches on. Editable names are fine;
      // a changed key would orphan every rule that already targets this badge.
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
