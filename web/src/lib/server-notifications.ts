import { cache } from "react";
import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  notificationPreferencesResponseSchema,
  type NotificationPreferencesResponse,
} from "@/schemas/notifications.schema";

export const getNotificationPreferencesServer = cache(
  async (): Promise<NotificationPreferencesResponse | null> => {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const response = await fetch(`${serverApiBaseUrl}/notifications/preferences`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return notificationPreferencesResponseSchema.parse(await response.json());
  },
);
