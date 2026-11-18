import { z } from "zod";
import { programmeSchema } from "@/schemas/challenge-setup.schema";

// GET /programmes/current — the programme the user is doing now, as distinct
// from the one the setup questionnaire assigned. Null between programmes.
//
// The journey's own anchor and duration ride alongside the authored content:
// a second programme must count from its own day 1, not continue the first
// one's, so these come from the enrolment rather than the programme.
export const currentProgrammeSchema = z.object({
  slug: z.string(),
  day1ScheduledFor: z.string(),
  durationDays: z.number(),
  currentDay: z.number(),
  startedAt: z.string(),
  programme: programmeSchema,
  // Mirror document id of the programme content in use. Studio For-you
  // matching keys off it (a lesson's programmeRelevance carries source
  // document ids, not slugs). Absent on older api responses: read as null so
  // the home falls back to its general set rather than failing the fetch.
  programmeSourceId: z.string().nullable().catch(null),
});

export type CurrentProgramme = z.infer<typeof currentProgrammeSchema>;
