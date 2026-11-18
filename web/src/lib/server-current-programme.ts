import { cache } from "react";
import { serverApiGet } from "@/lib/api-client";
import {
  currentProgrammeSchema,
  type CurrentProgramme,
} from "@/schemas/current-programme.schema";

/**
 * The programme the signed-in user is doing now, or null between programmes.
 *
 * Null is a real answer, not a failure: it is what a user sees before their
 * first start and after finishing one, and every programme-aware surface
 * renders its own no-active-programme state from it.
 *
 * Wrapped in cache() for the same reason getProfileServer is — several
 * programme-aware surfaces read this per navigation and should share one
 * request rather than each hitting the api.
 */
export const getCurrentProgrammeServer = cache(
  async (): Promise<CurrentProgramme | null> =>
    serverApiGet("/programmes/current", currentProgrammeSchema.nullable()),
);
