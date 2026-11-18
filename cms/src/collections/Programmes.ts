import type { CollectionConfig } from "payload";
import { contentSyncHooks } from "../content-sync/hooks";
import { lockKeyOnceSet } from "./engine-key-access";
import {
  captureProgrammeOperation,
  preventAssignedProgrammeArchive,
  preventAssignedProgrammeDelete,
  preventProgrammeKeyChange,
  restoreProgrammeEligibilityAfterError,
  synchroniseProgrammeEligibility,
} from "./programme-lifecycle";
import {
  difficultyOptions,
  experienceLevelOptions,
  insightMomentTriggerOptions,
  positiveIntegerValidator,
  programmeAccessOptions,
  programmeTierOptions,
  programmeTrackOptions,
  validateProgrammeBeforePublish,
} from "./content-validation";

const optionsFrom = (values: readonly string[]) =>
  values.map((value) => ({ label: value, value }));

const programmeSyncHooks = contentSyncHooks("programmes");

export const Programmes: CollectionConfig = {
  slug: "programmes",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "key", "lifecycleStatus", "status", "updatedAt"],
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  hooks: {
    beforeOperation: [captureProgrammeOperation],
    beforeChange: [preventProgrammeKeyChange, preventAssignedProgrammeArchive],
    beforeDelete: [preventAssignedProgrammeDelete],
    afterError: [restoreProgrammeEligibilityAfterError],
    beforeValidate: [validateProgrammeBeforePublish],
    afterChange: [
      synchroniseProgrammeEligibility,
      ...(programmeSyncHooks.afterChange ?? []),
    ],
    afterDelete: programmeSyncHooks.afterDelete,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "key",
      type: "text",
      required: true,
      unique: true,
      index: true,
      access: { update: lockKeyOnceSet },
      admin: {
        description:
          "Permanent matching identity. It cannot be changed after it is set.",
      },
    },
    {
      name: "lifecycleStatus",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: optionsFrom(["draft", "live", "retired", "archived"]),
    },
    {
      name: "access",
      type: "select",
      required: true,
      defaultValue: "open",
      options: optionsFrom(programmeAccessOptions),
      admin: {
        description:
          "Open programmes can be started by anyone. Locked ones appear only for a user the engine has unlocked them for.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "durationDays",
      type: "number",
      required: true,
      min: 1,
      validate: positiveIntegerValidator("durationDays"),
    },
    {
      name: "experienceLevel",
      type: "select",
      required: true,
      options: optionsFrom(experienceLevelOptions),
    },
    {
      name: "difficulty",
      type: "select",
      required: true,
      options: optionsFrom(difficultyOptions),
    },
    {
      name: "track",
      type: "select",
      required: true,
      options: optionsFrom(programmeTrackOptions),
    },
    {
      name: "minimumTier",
      type: "select",
      required: true,
      defaultValue: "free",
      options: optionsFrom(programmeTierOptions),
      admin: {
        description:
          "The lowest plan that may start this programme. Free is open to everyone; Creator or Pro requires that plan or higher. A programme already in progress is never interrupted by this.",
      },
    },
    {
      name: "founderVideoUrl",
      type: "text",
    },
    {
      name: "expectations",
      type: "richText",
    },
    {
      name: "ctaText",
      type: "text",
    },
    {
      name: "milestones",
      type: "array",
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
        },
        {
          name: "triggerDay",
          type: "number",
          required: true,
          min: 1,
          validate: positiveIntegerValidator("triggerDay"),
        },
        {
          name: "copy",
          type: "richText",
          required: true,
        },
      ],
    },
    {
      name: "insightMoments",
      type: "array",
      fields: [
        {
          name: "triggerType",
          type: "select",
          required: true,
          options: optionsFrom(insightMomentTriggerOptions),
        },
        {
          name: "triggerCondition",
          type: "textarea",
          required: true,
        },
        {
          name: "copy",
          type: "richText",
          required: true,
        },
      ],
    },
    {
      name: "lessons",
      type: "relationship",
      relationTo: "lessons",
      hasMany: true,
      admin: {
        description: "Legacy relationship retained during module migration.",
      },
    },
  ],
};
