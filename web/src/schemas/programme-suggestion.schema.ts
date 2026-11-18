import { z } from "zod";

// GET /programmes/suggestion — the one programme the dashboard invites the
// user to start, or null. Identified by slug; no programme name is a key.
export const programmeSuggestionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  track: z.string().nullable(),
  description: z.string().nullable(),
});

export type ProgrammeSuggestion = z.infer<typeof programmeSuggestionSchema>;

export const dismissProgrammeSuggestionSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,17}$/),
});

export type DismissProgrammeSuggestion = z.infer<
  typeof dismissProgrammeSuggestionSchema
>;
