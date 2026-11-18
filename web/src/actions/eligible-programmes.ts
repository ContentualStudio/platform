"use server";

import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import { defineServerAction } from "@/lib/server/action";

/**
 * Clears the newly-unlocked treatment.
 *
 * A separate call from the read so that opening the list is not a write, and
 * a prefetch or a bot cannot silently mark somebody's unlocks as seen.
 */
export const markEligibleProgrammesSeenAction = defineServerAction({
  name: "markEligibleProgrammesSeen",
  rateLimit: "mutation",
  failureMessage: "We couldn't update your programme list.",
  handler: async () => {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const response = await fetch(
      `${serverApiBaseUrl}/programmes/eligible/seen`,
      {
        method: "POST",
        cache: "no-store",
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      },
    );

    if (!response.ok) {
      throw new Error(`Marking seen failed with status ${response.status}`);
    }

    return { seen: true };
  },
});
