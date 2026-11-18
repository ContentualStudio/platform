import { cache } from "react";
import { cookies } from "next/headers";
import { z } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";
import { billingTierKeySchema } from "@/schemas/billing.schema";

const studioLessonSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  attachmentsCount: z.number().int().nonnegative(),
  /** Authored in the CMS: the lowest plan that opens the body. */
  minimumTier: billingTierKeySchema.catch("free"),
  /** The api's answer for this user: body withheld until they upgrade. */
  locked: z.boolean().default(false),
  lessonType: z.string().nullable().catch(null),
  skillLevel: z.string().nullable().catch(null),
  contentType: z.string().nullable().catch(null),
  platforms: z.array(z.string()).catch([]),
  programmeRelevance: z.array(z.string()).catch([]),
  programmeDayStart: z.number().nullable().catch(null),
  programmeDayEnd: z.number().nullable().catch(null),
});

export type StudioLessonSummary = z.infer<typeof studioLessonSchema>;

// cache()d per request like every sibling reader: the heaviest fetch on the
// page must not run twice when a second caller (or a retry) asks for it.
export const getStudioLessonsServer = cache(async (): Promise<
  StudioLessonSummary[]
> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${serverApiBaseUrl}/studio/lessons`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    return [];
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = studioLessonSchema.array().safeParse(payload);

  return parsed.success ? parsed.data : [];
});
