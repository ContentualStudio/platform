import { z } from "zod";
import {
  biggestChallenges,
  experienceLevels,
  mainGoals,
  postingFrequencies,
  userTypes,
} from "@contentual/programme-matching-vocabulary";

// The answer lists live in the matching vocabulary, which is the package the
// CMS builds its rule editor from. Re-exported here under the names this
// schema's consumers already use, so there is one list per question rather
// than two that can silently disagree — a renamed answer would otherwise leave
// every rule written against it unmatchable, with nothing to fail.
export const userTypeOptions = userTypes;

// Deliberately not taken from the vocabulary: Stage 1 has always written
// "X / Twitter" where everything else writes "X (Twitter)", and rewriting
// stored answers is a migration, not a refactor. `canonicalPlatform` bridges
// the two on the way into matching.
export const platformOptions = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "X / Twitter",
  "Facebook",
] as const;

export const experienceLevelOptions = experienceLevels;

export const postingFrequencyOptions = postingFrequencies;

export const mainGoalOptions = mainGoals;

export const biggestChallengeOptions = biggestChallenges;

const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export const stage1AnswersSchema = z.object({
  name: z.string().trim().min(1).max(120),
  userType: z.enum(userTypeOptions),
  region: z.string().trim().min(2).max(56),
  timezone: z.string().refine((value) => supportedTimezones.has(value), {
    message: "Unrecognized timezone.",
  }),
  platforms: z.array(z.enum(platformOptions)).min(1),
  experienceLevel: z.enum(experienceLevelOptions),
  postingFrequency: z.enum(postingFrequencyOptions),
  mainGoal: z.enum(mainGoalOptions),
  biggestChallenge: z.enum(biggestChallengeOptions),
});

export type Stage1AnswersInput = z.infer<typeof stage1AnswersSchema>;

// Each field is still fully validated when present, but a step can be saved
// on its own — completion is a derived fact (all fields eventually present),
// not a single one-shot submission.
export const stage1PartialAnswersSchema = stage1AnswersSchema.partial();

export type Stage1PartialAnswersInput = z.infer<
  typeof stage1PartialAnswersSchema
>;

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    region: z.string().trim().min(2).max(56).optional(),
    timezone: z
      .string()
      .refine((value) => supportedTimezones.has(value), {
        message: "Unrecognized timezone.",
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required.",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const notificationPreferencesSchema = z
  .object({
    dailyTaskNotice: z.boolean(),
    badgeEarned: z.boolean(),
    streakAtRisk: z.boolean(),
    milestoneReached: z.boolean(),
  })
  .strict();

export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;

export const themePreferenceSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
  })
  .strict();

export type ThemePreferenceInput = z.infer<typeof themePreferenceSchema>;
