import { z } from "zod";
import {
  contentTypes,
  followerRanges,
  nicheStatuses,
  postingGoals,
} from "@contentual/programme-matching-vocabulary";

// Presentation order, which the vocabulary does not own — it lists the same
// eight platforms for rule authoring, ranked differently. The tokens are
// identical, so a rule and an answer still meet.
export const platformOptions = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Facebook",
  "X (Twitter)",
  "Pinterest",
  "Other",
] as const;

// Re-exported from the matching vocabulary under the names this schema's
// consumers already use, so each question has one answer list rather than two
// that can drift apart.
export const postingGoalOptions = postingGoals;

export const weekdayOptions = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const nicheOptions = nicheStatuses;

export const contentTypeOptions = contentTypes;

export const followerRangeOptions = followerRanges;

// Declared once, without a default, because the default belongs to exactly one
// of the two schemas below. Reading a whole setup, an absent value means "no
// choice needed" and null is right. Saving one step, an absent key means the
// user did not answer *this* field — and `.default(null)` survives both
// `.optional()` and `.partial()` in zod, so sharing the defaulted field would
// turn every unrelated step save into a write that erases the stored primary.
const primaryPlatformField = z.enum(platformOptions).nullable();

const stage2AnswersFields = {
  platforms: z.array(z.enum(platformOptions)).min(1).max(2),
  // Older single-platform rows have no value. Treat that as the explicit
  // "no choice needed" value while still rejecting an absent choice for two
  // selected platforms in the refinement below.
  primaryPlatform: primaryPlatformField.default(null),
  postingGoal: z.enum(postingGoalOptions),
  weeklyCommitment: z.number().int().min(1).max(7),
  availableDays: z.array(z.enum(weekdayOptions)).min(1),
  sawTestimonial: z.boolean(),
  nicheDefined: z.enum(nicheOptions),
  contentType: z.enum(contentTypeOptions),
  followerRange: z.enum(followerRangeOptions),
  instagramConnected: z.boolean(),
  milestone: z
    .string()
    .trim()
    .min(1, "Tell us your milestone to continue.")
    .max(500),
};

export const stage2AnswersSchema = z
  .object(stage2AnswersFields)
  .superRefine((value, ctx) => {
    if (
      value.primaryPlatform !== null &&
      !value.platforms.includes(value.primaryPlatform)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["primaryPlatform"],
        message: "Choose one of the platforms you selected.",
      });
    }

    if (value.platforms.length === 2 && value.primaryPlatform === null) {
      ctx.addIssue({
        code: "custom",
        path: ["primaryPlatform"],
        message: "Choose a primary platform when selecting two platforms.",
      });
    }
  });

export type Stage2AnswersInput = z.infer<typeof stage2AnswersSchema>;

// A step is saved on its own so an abandoned session keeps its progress —
// completion is derived once every required field is present, exactly like
// stage 1.
export const stage2PartialAnswersSchema = z
  .object({
    platforms: stage2AnswersFields.platforms.optional(),
    primaryPlatform: primaryPlatformField.optional(),
    postingGoal: stage2AnswersFields.postingGoal.optional(),
    weeklyCommitment: stage2AnswersFields.weeklyCommitment.optional(),
    availableDays: stage2AnswersFields.availableDays.optional(),
    sawTestimonial: stage2AnswersFields.sawTestimonial.optional(),
    nicheDefined: stage2AnswersFields.nicheDefined.optional(),
    contentType: stage2AnswersFields.contentType.optional(),
    followerRange: stage2AnswersFields.followerRange.optional(),
    instagramConnected: stage2AnswersFields.instagramConnected.optional(),
    milestone: stage2AnswersFields.milestone.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.primaryPlatform !== undefined &&
      value.primaryPlatform !== null &&
      value.platforms !== undefined &&
      !value.platforms.includes(value.primaryPlatform)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["primaryPlatform"],
        message: "Choose one of the platforms you selected.",
      });
    }
  });

export type Stage2PartialAnswersInput = z.infer<
  typeof stage2PartialAnswersSchema
>;
