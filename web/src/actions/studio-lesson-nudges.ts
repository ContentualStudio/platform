"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";
import { defineServerAction } from "@/lib/server/action";
import { studioLessonNudgeSchema } from "@/lib/studio-lesson-nudge";

export const claimStudioLessonNudgeAction = defineServerAction({
  name: "claimStudioLessonNudge",
  input: z.object({ taskId: z.string().min(1) }),
  rateLimit: "mutation",
  failureMessage: "We couldn't load related lessons.",
  handler: async ({ taskId }) => {
    const cookieHeader = (await cookies()).toString();
    const response = await fetch(
      `${serverApiBaseUrl}/studio/lesson-nudges/${encodeURIComponent(taskId)}`,
      {
        method: "POST",
        cache: "no-store",
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      },
    );
    if (!response.ok)
      throw new Error(`Lesson nudge failed with status ${response.status}`);
    return z
      .object({ nudge: studioLessonNudgeSchema.nullable() })
      .parse(await response.json()).nudge;
  },
});
