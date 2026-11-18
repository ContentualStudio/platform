import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  upcomingTaskPreviewSchema,
  weekAheadSchema,
  type UpcomingTaskPreview,
  type WeekAhead,
} from "@/schemas/week-ahead.schema";

async function cookieHeaders(): Promise<Record<string, string> | undefined> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return cookieHeader ? { Cookie: cookieHeader } : undefined;
}

/**
 * The week-ahead window for the signed-in user. Failures throw so the page's
 * RetryBoundary can offer a retry — an empty list here means "nothing left to
 * come", which is a different thing to say than "we could not load it".
 */
export async function getWeekAheadServer(): Promise<WeekAhead> {
  const response = await fetch(`${serverApiBaseUrl}/programme-tasks/upcoming`, {
    cache: "no-store",
    headers: await cookieHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Upcoming tasks request failed with status ${response.status}`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = weekAheadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("Upcoming tasks returned an unreadable result");
  }

  return parsed.data;
}

/**
 * One upcoming day's authored task. `null` is "no such upcoming day" — a past
 * day, a day beyond the programme, or a day the mirror never authored — and
 * the caller turns it into a not-found page.
 */
export async function getUpcomingTaskPreviewServer(
  dayNumber: number,
): Promise<UpcomingTaskPreview | null> {
  const response = await fetch(
    `${serverApiBaseUrl}/programme-tasks/upcoming/${dayNumber}`,
    {
      cache: "no-store",
      headers: await cookieHeaders(),
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Upcoming task preview failed with status ${response.status}`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = upcomingTaskPreviewSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("Upcoming task preview returned an unreadable result");
  }

  return parsed.data;
}
