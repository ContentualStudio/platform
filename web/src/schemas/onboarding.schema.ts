import { z } from "zod";

export const userTypeOptions = [
  "Independent Creator",
  "Business Owner",
  "Marketing Manager",
] as const;

export const platformOptions = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "X / Twitter",
  "Facebook",
] as const;

export type PlatformOption = (typeof platformOptions)[number];

export const livePlatforms = new Set<string>(["Instagram"]);

export const experienceLevelOptions = [
  "Just getting started (0–3 months)",
  "Consistent beginner (3–6 months)",
  "Intermediate (6–18 months)",
  "Experienced (2+ years)",
  "On-and-off",
] as const;

export const postingFrequencyOptions = [
  "Daily",
  "A few times a week",
  "Weekly",
  "A few times a month",
  "Rarely",
] as const;

export const mainGoalOptions = [
  "Grow my audience",
  "Be more consistent",
  "Improve my content",
  "Increase engagement",
  "Build my business",
] as const;

export const biggestChallengeOptions = [
  "Staying consistent",
  "Running out of ideas",
  "Finding time",
  "Editing content",
  "Growing an audience",
] as const;

export const stage1AnswersSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name."),
  userType: z.enum(userTypeOptions, {
    message: "Please choose one.",
  }),
  region: z.string().trim().min(2, "Please choose your region."),
  timezone: z.string().min(1, "Please confirm your timezone."),
  platforms: z
    .array(z.enum(platformOptions))
    .min(1, "Choose at least one platform."),
  experienceLevel: z.enum(experienceLevelOptions, {
    message: "Please choose one.",
  }),
  postingFrequency: z.enum(postingFrequencyOptions, {
    message: "Please choose one.",
  }),
  mainGoal: z.enum(mainGoalOptions, {
    message: "Please choose one.",
  }),
  biggestChallenge: z.enum(biggestChallengeOptions, {
    message: "Please choose one.",
  }),
});

export type Stage1Answers = z.infer<typeof stage1AnswersSchema>;

// A step is saved on its own, so the outgoing payload only ever carries
// whichever field the user just answered.
export const stage1PartialAnswersSchema = stage1AnswersSchema.partial();

export type Stage1PartialAnswers = z.infer<typeof stage1PartialAnswersSchema>;

export const stage1SummarySchema = z.object({
  name: z.string(),
  userType: z.string().nullable(),
  region: z.string().nullable(),
  timezone: z.string().nullable(),
  platforms: z.array(z.string()).nullable(),
  experienceLevel: z.string().nullable(),
  postingFrequency: z.string().nullable(),
  mainGoal: z.string().nullable(),
  biggestChallenge: z.string().nullable(),
  bio: z.string().nullable(),
});

const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter your display name.").max(120),
  bio: z.string().trim().max(280, "Keep your bio under 280 characters."),
  region: z.string().trim().min(2, "Choose your country.").max(56),
  timezone: z.string().refine((value) => supportedTimezones.has(value), {
    message: "Choose a recognized timezone.",
  }),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const notificationPreferencesSchema = z.object({
  dailyTaskNotice: z.boolean(),
  badgeEarned: z.boolean(),
  streakAtRisk: z.boolean(),
  milestoneReached: z.boolean(),
});

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export const themePreferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});

export type PersistedThemePreference = z.infer<typeof themePreferenceSchema>;

export const profileResponseSchema = z.object({
  onboardingCompleted: z.boolean(),
  notifications: notificationPreferencesSchema,
  preferences: themePreferenceSchema,
  user: z.object({
    id: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    name: z.string(),
  }),
  stage1: stage1SummarySchema,
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;
