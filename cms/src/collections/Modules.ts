import type { CollectionConfig } from "payload";

import { contentSyncHooks } from "../content-sync/hooks";
import {
  positiveIntegerValidator,
  validateModuleBeforePublish,
} from "./content-validation";

export const Modules: CollectionConfig = {
  slug: "modules",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "programme", "order", "status", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: {
    beforeValidate: [validateModuleBeforePublish],
    ...contentSyncHooks("modules"),
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "order",
      type: "number",
      required: true,
      min: 1,
      validate: positiveIntegerValidator("order"),
      admin: {
        description: "The authored order within this programme.",
      },
    },
    {
      name: "programme",
      type: "relationship",
      relationTo: "programmes",
      required: true,
    },
    {
      name: "lessons",
      type: "relationship",
      relationTo: "lessons",
      hasMany: true,
      required: true,
    },
  ],
};
