import { cache } from "react";
import { z } from "zod";
import { adminServerGet } from "@/lib/admin/admin-api";

const countsSchema = {
  participants: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  droppedOff: z.number().int().nonnegative(),
  averageCompletion: z.number().nullable(),
};

const programmeCompletionRowSchema = z.object({
  slug: z.string(),
  title: z.string().nullable(),
  ...countsSchema,
});

const programmeCompletionReportSchema = z.object({
  summary: z.object({
    ...countsSchema,
    completionRate: z.number().nullable(),
  }),
  programmes: z.array(programmeCompletionRowSchema),
});

export type ProgrammeCompletionRow = z.infer<typeof programmeCompletionRowSchema>;

/**
 * One request per render, shared by the overview and the programme list:
 * each sits in its own boundary so a section that fails on retry does not
 * take the other's figures with it.
 */
export const getProgrammeCompletion = cache(() =>
  adminServerGet(
    "/admin/analytics/programme-completion",
    programmeCompletionReportSchema,
  ),
);
