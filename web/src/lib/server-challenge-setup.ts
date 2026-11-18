import { cache } from "react";
import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  challengeSetupStatusSchema,
  type ChallengeSetupStatus,
} from "@/schemas/challenge-setup.schema";

// Cached per-request (like getProfileServer) so a layout and its page share
// one upstream call instead of hitting the api twice per navigation.
export const getChallengeSetupServer = cache(
  async (): Promise<ChallengeSetupStatus | null> => {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const response = await fetch(`${serverApiBaseUrl}/challenge-setup/me`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return challengeSetupStatusSchema.parse(payload);
  },
);
