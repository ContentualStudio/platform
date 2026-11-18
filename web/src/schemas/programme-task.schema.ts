import { z } from "zod";

const richText = z.unknown();

// Authored programme tasks as returned by GET /programme-tasks. Extra CMS
// fields are allowed through so a new mirror column does not break the page;
// the fields the daily task card renders are named here so they survive a
// parse and stay typed.
export const programmeTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    contentType: z.string(),
    weekIndex: z.number().int(),
    dayIndex: z.number().int(),
    dayNumber: z.number().int().optional(),
    orderWithinDay: z.number().int().optional(),
    dayType: z.enum(["push", "protect", "recharge"]).nullish(),
    timeEstimateMinutes: z.number().nullish(),
    publishSlot: z.boolean().nullish(),
    postNumber: z.number().nullish(),
    moduleId: z.string().nullish(),
    lessonId: z.string().nullish(),
    platform: z
      .enum([
        "instagram",
        "tiktok",
        "youtube",
        "linkedin",
        "facebook",
        "x",
        "pinterest",
      ])
      .nullish(),
    cameraRequired: z.boolean().nullish(),
    objective: z.string().nullish(),
    openingLine: z.string().nullish(),
    instructions: richText.optional(),
    whyItMatters: richText.optional(),
    pausePrompt: richText.optional(),
    outputDescription: richText.optional(),
  })
  .passthrough();

export type ProgrammeTask = z.infer<typeof programmeTaskSchema>;

// GET /programme-tasks/progress — the outcomes already on record for the
// active assignment. The card opens from these rather than browser storage,
// so a resolved day stays resolved on a new device.
export const programmeTaskProgressSchema = z.object({
  taskId: z.string(),
  outcome: z.enum(["completed", "skipped"]),
  localDate: z.string(),
  recordedAt: z.string(),
});

export type ProgrammeTaskProgress = z.infer<typeof programmeTaskProgressSchema>;
