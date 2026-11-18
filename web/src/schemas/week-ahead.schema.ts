import { z } from "zod";
import { programmeTaskSchema } from "../schemas/programme-task.schema";

// GET /programme-tasks/upcoming — the next six programme days of the active
// enrolment. Absent fields are omitted by the API rather than nulled, so the
// row can render only what the CMS actually authored.
export const upcomingTaskDaySchema = z.object({
  dayNumber: z.number().int(),
  taskId: z.string(),
  title: z.string(),
  contentType: z.string().optional(),
  dayType: z.enum(["push", "protect", "recharge"]).optional(),
  cameraRequired: z.boolean().optional(),
  timeEstimateMinutes: z.number().optional(),
});

export type UpcomingTaskDay = z.infer<typeof upcomingTaskDaySchema>;

export const weekAheadSchema = z.object({
  hasActiveProgramme: z.boolean(),
  programmeSlug: z.string().nullable(),
  currentDay: z.number().int(),
  durationDays: z.number().int(),
  reachesProgrammeEnd: z.boolean(),
  days: upcomingTaskDaySchema.array(),
});

export type WeekAhead = z.infer<typeof weekAheadSchema>;

// GET /programme-tasks/upcoming/:dayNumber — the full authored task behind one
// upcoming row, read-only.
export const upcomingTaskPreviewSchema = programmeTaskSchema;

export type UpcomingTaskPreview = z.infer<typeof upcomingTaskPreviewSchema>;
