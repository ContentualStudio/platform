import { serverApiGetOrThrow } from "@/lib/api-client";
import {
  programmeHistorySchema,
  type ProgrammeHistory,
} from "@/schemas/programme-history.schema";

/**
 * The signed-in user's programme history.
 *
 * Throws rather than returning an empty history on failure: empty is a real
 * answer here ("you haven't started one yet"), so an outage must not render
 * as it. The page's RetryBoundary turns the throw into error-and-retry.
 */
export function getProgrammeHistoryServer(): Promise<ProgrammeHistory> {
  return serverApiGetOrThrow(
    "/programmes/history",
    programmeHistorySchema,
    "Programme history is unavailable",
  );
}
