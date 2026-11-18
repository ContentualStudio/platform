import { z } from "zod";
import {
  contentTypes,
  followerRanges,
  nicheStatuses,
  postingGoals,
  platforms,
} from "@contentual/programme-matching-vocabulary";

export const platformOptions = platforms;

export type PlatformOption = (typeof platformOptions)[number];

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

export type Weekday = (typeof weekdayOptions)[number];

export const nicheOptions = nicheStatuses;

export const contentTypeOptions = contentTypes;

export const followerRangeOptions = followerRanges;

// Declared once, without a default. The default belongs to the full-answers
// schema, where an absent value legitimately means "no choice needed"; a step
// save must not carry it, because `.default(null)` survives `.partial()` in
// zod and would make every unrelated step post a null that erases the stored
// primary platform.
const primaryPlatformField = z.enum(platformOptions).nullable();

const stage2AnswersFields = {
  platforms: z
    .array(z.enum(platformOptions))
    .min(1, "Choose at least one.")
    .max(2, "Choose no more than two platforms."),
  primaryPlatform: primaryPlatformField.default(null),
  postingGoal: z.enum(postingGoalOptions, { message: "Please choose one." }),
  weeklyCommitment: z.number().int().min(1).max(7),
  availableDays: z
    .array(z.enum(weekdayOptions))
    .min(1, "Choose at least one day."),
  sawTestimonial: z.boolean(),
  nicheDefined: z.enum(nicheOptions, { message: "Please choose one." }),
  contentType: z.enum(contentTypeOptions, { message: "Please choose one." }),
  followerRange: z.enum(followerRangeOptions, {
    message: "Please choose one.",
  }),
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

export type Stage2Answers = z.infer<typeof stage2AnswersSchema>;

// A step is saved on its own, so the outgoing payload only ever carries
// whichever field the user just answered.
export const stage2PartialAnswersSchema = z
  .object({
    ...stage2AnswersFields,
    primaryPlatform: primaryPlatformField.optional(),
  })
  .partial()
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

export type Stage2PartialAnswers = z.infer<typeof stage2PartialAnswersSchema>;

// ── Assigned programme (authored content mirror) ──

export const programmeFeatureSchema = z.object({
  icon: z.enum(["clock", "calendar", "spark", "target"]),
  label: z.string(),
});

export const programmeSnapshotStatSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const programmeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  features: z.array(programmeFeatureSchema),
  difficulty: z.number(),
  level: z.string(),
  durationLabel: z.string(),
  durationDays: z.number(),
  // Optional authored fields — omitted by the Welcome Page when absent.
  founderVideo: z
    .object({ vimeoId: z.string(), title: z.string().optional() })
    .optional(),
  snapshot: z.array(programmeSnapshotStatSchema).optional(),
  expectations: z.object({ title: z.string(), body: z.string() }).optional(),
});

export type Programme = z.infer<typeof programmeSchema>;

// GET /programmes/:slug/welcome — a programme's welcome content and whether
// this user can start it right now.
export const programmeStartStateSchema = z.enum([
  "startable",
  "active",
  "another_active",
  "setup_incomplete",
  "locked",
  "requires_upgrade",
]);

export type ProgrammeStartState = z.infer<typeof programmeStartStateSchema>;

export const programmeWelcomeSchema = z.object({
  programme: programmeSchema,
  start: programmeStartStateSchema,
});

export type ProgrammeWelcome = z.infer<typeof programmeWelcomeSchema>;

export const challengeSetupStatusSchema = z.object({
  setupCompleted: z.boolean(),
  programmeAssignedAt: z.string().nullable(),
  programmeStarted: z.boolean(),
  day1ScheduledFor: z.string().nullable(),
  programmeCompleted: z.boolean(),
  assignedProgramme: programmeSchema.nullable(),
  answers: z.object({
    platforms: z.array(z.string()).nullable(),
    primaryPlatform: z.string().nullable(),
    postingGoal: z.string().nullable(),
    weeklyCommitment: z.number().nullable(),
    availableDays: z.array(z.string()).nullable(),
    sawTestimonial: z.boolean().nullable(),
    nicheDefined: z.string().nullable(),
    contentType: z.string().nullable(),
    followerRange: z.string().nullable(),
    instagramConnected: z.boolean().nullable(),
    milestone: z.string().nullable(),
  }),
});

export type ChallengeSetupStatus = z.infer<typeof challengeSetupStatusSchema>;

// A blank status for a user who hasn't started the questionnaire yet, so pages
// don't hand-roll the null-filled shape (which would drift from the schema).
export const emptyChallengeSetupStatus: ChallengeSetupStatus = {
  setupCompleted: false,
  programmeAssignedAt: null,
  programmeStarted: false,
  day1ScheduledFor: null,
  programmeCompleted: false,
  assignedProgramme: null,
  answers: {
    platforms: null,
    primaryPlatform: null,
    postingGoal: null,
    weeklyCommitment: null,
    availableDays: null,
    sawTestimonial: null,
    nicheDefined: null,
    contentType: null,
    followerRange: null,
    instagramConnected: null,
    milestone: null,
  },
};
