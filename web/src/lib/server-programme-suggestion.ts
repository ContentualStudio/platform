import { serverApiGet } from "@/lib/api-client";
import {
  programmeSuggestionSchema,
  type ProgrammeSuggestion,
} from "@/schemas/programme-suggestion.schema";

/**
 * The signed-in user's active programme suggestion, or null.
 *
 * Unlike most reads, a failure here is also null. The suggestion is an
 * optional invitation: an outage should hide it, never blank or block the
 * dashboard around it.
 */
export async function getProgrammeSuggestionServer(): Promise<ProgrammeSuggestion | null> {
  try {
    return await serverApiGet(
      "/programmes/suggestion",
      programmeSuggestionSchema.nullable(),
    );
  } catch {
    return null;
  }
}
