import { z } from "zod";

export const supportActionKeySchema = z.enum([
  "grant_founding",
  "unflag_founding",
  "release_programme",
]);

export type SupportActionKey = z.infer<typeof supportActionKeySchema>;

export const applySupportActionInputSchema = z.object({
  userId: z.string().min(1),
  action: supportActionKeySchema,
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason for this action.")
    .max(500, "Keep the reason under 500 characters."),
});

export type ApplySupportActionInput = z.infer<typeof applySupportActionInputSchema>;

export const supportLogEntrySchema = z.object({
  id: z.string(),
  action: supportActionKeySchema,
  actorEmail: z.string(),
  reason: z.string(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type SupportLogEntry = z.infer<typeof supportLogEntrySchema>;

/**
 * Whether an action can run now: `available` runs, `satisfied` would change
 * nothing, `blocked` has an unmet precondition. Only `available` is enabled.
 */
export const supportActionStateSchema = z.discriminatedUnion("status", [
  z.object({ key: supportActionKeySchema, status: z.literal("available") }),
  z.object({ key: supportActionKeySchema, status: z.literal("satisfied"), reason: z.string() }),
  z.object({ key: supportActionKeySchema, status: z.literal("blocked"), reason: z.string() }),
]);

export type SupportActionState = z.infer<typeof supportActionStateSchema>;

export const supportOverviewSchema = z.object({
  isFoundingCreator: z.boolean(),
  activeProgramme: z
    .object({
      programmeSlug: z.string(),
      day1ScheduledFor: z.string(),
      durationDays: z.number(),
      currentDay: z.number(),
      lastDay: z.string(),
      overdue: z.boolean(),
    })
    .nullable(),
  actions: z.array(supportActionStateSchema),
  log: z.array(supportLogEntrySchema),
});

export type SupportOverview = z.infer<typeof supportOverviewSchema>;

export const applySupportActionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("applied"), entry: supportLogEntrySchema }),
  z.object({ status: z.literal("unchanged"), reason: z.string() }),
]);

export type ApplySupportActionResult = z.infer<typeof applySupportActionResultSchema>;
