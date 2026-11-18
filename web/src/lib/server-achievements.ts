import { cookies } from "next/headers";
import { z } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";

const userAchievementsSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  badges: z.array(
    z.object({
      badgeId: z.string(),
      key: z.string().nullable(),
      name: z.string().nullable(),
      earnedAt: z.string(),
    }),
  ),
});

export type UserAchievements = z.infer<typeof userAchievementsSchema>;

/**
 * The user's earned badges and live streak. Null when the api could not be
 * read, so the tab can say so rather than showing every badge as locked.
 */
export async function getUserAchievementsServer(): Promise<UserAchievements | null> {
  const cookieHeader = (await cookies()).toString();

  const response = await fetch(`${serverApiBaseUrl}/gamification/achievements`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const parsed = userAchievementsSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}
