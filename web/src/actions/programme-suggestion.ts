"use server";

import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import { defineServerAction } from "@/lib/server/action";
import {
  dismissProgrammeSuggestionSchema,
  type DismissProgrammeSuggestion,
} from "@/schemas/programme-suggestion.schema";

/** Clears the dashboard's programme suggestion for good. */
export const dismissProgrammeSuggestionAction = defineServerAction<
  { dismissed: true },
  DismissProgrammeSuggestion
>({
  name: "dismissProgrammeSuggestion",
  input: dismissProgrammeSuggestionSchema,
  rateLimit: "mutation",
  failureMessage: "We couldn't dismiss that suggestion. Try again.",
  handler: async ({ id }) => {
    const cookieHeader = (await cookies()).toString();

    const response = await fetch(
      `${serverApiBaseUrl}/programmes/suggestion/${encodeURIComponent(id)}/dismiss`,
      {
        method: "POST",
        cache: "no-store",
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      },
    );

    if (!response.ok) {
      throw new Error(`Dismissing suggestion failed with status ${response.status}`);
    }

    return { dismissed: true };
  },
});
