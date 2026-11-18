import { z } from "zod";
import { billingTierKeySchema } from "./billing.schema";

// GET /programmes/eligible — every programme the authenticated user may start.
// Programmes are identified by slug throughout; no name is ever a key.
export const eligibleProgrammeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  track: z.string().nullable(),
  durationDays: z.number(),
  durationLabel: z.string(),
  description: z.string(),
  locked: z.boolean(),
  unlocked: z.boolean(),
  unlockedAt: z.string().nullable(),
  newlyUnlocked: z.boolean(),
  active: z.boolean(),
  minimumTier: billingTierKeySchema.catch("free"),
  /** Above the user's plan; unlike `locked`, an upgrade opens it. */
  requiresUpgrade: z.boolean().default(false),
  /** Another programme is running; this one can start once it ends. */
  startBlockedByActive: z.boolean().default(false),
  targetPlatforms: z.array(z.string()).default([]),
  targetContentTypes: z.array(z.string()).default([]),
});

export type EligibleProgramme = z.infer<typeof eligibleProgrammeSchema>;
