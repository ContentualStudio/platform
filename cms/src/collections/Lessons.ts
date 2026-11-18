import type { CollectionConfig } from "payload";
import { contentSyncHooks } from "../content-sync/hooks";
import {
  experienceLevelOptions,
  lessonPlatformOptions,
  lessonTypeOptions,
  optionsFrom,
  positiveIntegerValidator,
  programmeTierOptions,
  taskContentTypeOptions,
  validateLessonBeforePublish,
} from "./content-validation";

const shownForLessonTypes =
  (...types: readonly string[]) =>
  (data: Record<string, unknown> | undefined) =>
    types.includes(String(data?.lessonType));

export const Lessons: CollectionConfig = {
  slug: "lessons",
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
    ...contentSyncHooks("lessons"),
    beforeValidate: [validateLessonBeforePublish],
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
      name: "summary",
      type: "textarea",
    },
    {
      name: "lessonType",
      type: "select",
      required: true,
      options: optionsFrom(lessonTypeOptions),
    },
    {
      name: "skillLevel",
      type: "select",
      options: optionsFrom(experienceLevelOptions),
    },
    {
      name: "platforms",
      type: "select",
      hasMany: true,
      options: lessonPlatformOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    },
    {
      name: "contentType",
      type: "select",
      options: optionsFrom(taskContentTypeOptions),
    },
    {
      name: "programmeRelevance",
      type: "relationship",
      relationTo: "programmes",
      hasMany: true,
    },
    {
      name: "programmeDayStart",
      type: "number",
      min: 1,
      validate: positiveIntegerValidator("programmeDayStart"),
    },
    {
      name: "programmeDayEnd",
      type: "number",
      min: 1,
      validate: positiveIntegerValidator("programmeDayEnd"),
    },
    {
      name: "body",
      type: "richText",
      admin: {
        condition: shownForLessonTypes("article"),
      },
    },
    {
      name: "vimeoVideoId",
      type: "text",
      admin: {
        condition: shownForLessonTypes("video", "masterclass"),
      },
    },
    {
      name: "templateFile",
      type: "relationship",
      relationTo: "media",
      admin: {
        condition: shownForLessonTypes("template"),
      },
    },
    {
      name: "attachments",
      type: "relationship",
      relationTo: "media",
      hasMany: true,
      admin: {
        description:
          "Ordered lesson resources. Existing PDF templates are migrated into this list.",
      },
    },
    {
      name: "minimumTier",
      type: "select",
      required: true,
      defaultValue: "free",
      options: optionsFrom(programmeTierOptions),
      admin: {
        description:
          "The lowest plan that opens the body and downloads. The lesson still appears in the library for everyone; members below this plan see an upgrade prompt instead.",
      },
    },
  ],
};
