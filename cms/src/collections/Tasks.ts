import type { CollectionConfig } from "payload";
import { contentSyncHooks } from "../content-sync/hooks";
import {
  positiveIntegerValidator,
  taskContentTypeOptions,
  taskDayTypeOptions,
  taskPlatformOptions,
  validateTaskBeforePublish,
  optionsFrom,
} from "./content-validation";

export const Tasks: CollectionConfig = {
  slug: "tasks",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: {
    beforeValidate: [validateTaskBeforePublish],
    ...contentSyncHooks("tasks"),
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
      name: "instructions",
      type: "richText",
    },
    {
      name: "contentType",
      type: "select",
      options: optionsFrom(taskContentTypeOptions),
      admin: {
        description:
          "The machine-readable content type emitted with task.completed.",
      },
    },
    {
      name: "programme",
      type: "relationship",
      relationTo: "programmes",
      required: true,
    },
    {
      name: "module",
      type: "relationship",
      relationTo: "modules",
      required: true,
    },
    {
      name: "dayNumber",
      type: "number",
      required: true,
      min: 1,
      validate: positiveIntegerValidator("dayNumber"),
    },
    {
      name: "orderWithinDay",
      type: "number",
      required: true,
      min: 1,
      validate: positiveIntegerValidator("orderWithinDay"),
    },
    {
      name: "dayType",
      type: "select",
      required: true,
      options: optionsFrom(taskDayTypeOptions),
    },
    {
      name: "timeEstimateMinutes",
      type: "number",
      required: true,
      min: 1,
      validate: positiveIntegerValidator("timeEstimateMinutes"),
    },
    {
      name: "publishSlot",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "postNumber",
      type: "number",
      min: 1,
      validate: positiveIntegerValidator("postNumber"),
    },
    {
      name: "platform",
      type: "select",
      options: optionsFrom(taskPlatformOptions),
      admin: {
        description:
          "Where this task's output is published. Shown on the daily task card.",
      },
    },
    {
      name: "cameraRequired",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Surfaces a camera indicator so the creator knows to have one ready.",
      },
    },
    {
      name: "objective",
      type: "textarea",
      admin: {
        description: "What this task is meant to achieve, in the creator's terms.",
      },
    },
    {
      name: "openingLine",
      type: "textarea",
      admin: {
        description: "A suggested first line for the post, script or caption.",
      },
    },
    {
      name: "whyItMatters",
      type: "richText",
      admin: {
        description: "The reason this task is worth doing today.",
      },
    },
    {
      name: "pausePrompt",
      type: "richText",
    },
    {
      name: "outputDescription",
      type: "richText",
    },
    {
      name: "lesson",
      type: "relationship",
      relationTo: "lessons",
      admin: {
        description: "Legacy relationship retained during module migration.",
      },
    },
  ],
};
