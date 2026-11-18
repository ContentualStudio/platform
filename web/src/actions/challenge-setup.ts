"use server";

import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import { ActionFailure } from "@/lib/server/result";
import { defineServerAction } from "@/lib/server/action";
import {
  challengeSetupStatusSchema,
  type ChallengeSetupStatus,
} from "@/schemas/challenge-setup.schema";

export const completeStage2Action = defineServerAction<ChallengeSetupStatus>({
  name: "completeStage2",
  rateLimit: "mutation",
  failureMessage:
    "We couldn't match your programme. Your answers are saved; try again.",
  handler: async () => {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const response = await fetch(`${serverApiBaseUrl}/challenge-setup/complete`, {
      method: "POST",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      code?: string;
      message?: string;
    };

    // The api's own refusal, passed through as it was given. It is a decision,
    // not a fault, so it is raised as a named failure rather than left to the
    // wrapper's unexpected-error path — which would report it to PostHog and
    // replace the api's message with a generic one.
    if (!response.ok) {
      throw new ActionFailure(
        payload.code ?? "STAGE2_MATCH_FAILED",
        payload.message ??
          "We couldn't match your programme. Please try again.",
      );
    }

    return challengeSetupStatusSchema.parse(payload);
  },
});
