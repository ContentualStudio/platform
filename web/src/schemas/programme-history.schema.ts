import { z } from "zod";

// GET /programmes/history — every programme the user has started, split into
// the one under way and the ones that ended. Read-only.
export const programmeHistoryEntrySchema = z.object({
  enrolmentId: z.string(),
  slug: z.string(),
  /** Null when the programme is gone from the catalogue. */
  title: z.string().nullable(),
  track: z.string().nullable(),
  // A status this client does not know (e.g. a future "paused") is shown as
  // in progress rather than failing the whole page.
  status: z.enum(["active", "completed", "abandoned"]).catch("active"),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationDays: z.number(),
  completedDays: z.number(),
  completionPercent: z.number(),
});

export const programmeHistorySchema = z.object({
  inProgress: programmeHistoryEntrySchema.array(),
  past: programmeHistoryEntrySchema.array(),
});

export type ProgrammeHistoryEntry = z.infer<typeof programmeHistoryEntrySchema>;
export type ProgrammeHistory = z.infer<typeof programmeHistorySchema>;
