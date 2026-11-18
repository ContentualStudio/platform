"use server";

import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  parseNotificationPreferencesActionResponse,
  type NotificationPreferences,
} from "@/lib/notification-preference-actions";
import { defineServerAction } from "@/lib/server/action";
import {
  notificationPreferenceUpdateSchema,
  type NotificationPreferenceUpdate,
} from "@/schemas/notifications.schema";

async function requestNotificationPreferences(
  method: "GET" | "PATCH",
  body: NotificationPreferenceUpdate | undefined,
  fallbackMessage: string,
): Promise<NotificationPreferences> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${serverApiBaseUrl}/notifications/preferences`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const rawPayload = await response.json().catch(() => ({}));

  // Nothing is caught here any more. A refusal from the api arrives as an
  // ActionFailure and is passed through; anything else — a DNS failure, a
  // socket reset — is a real fault and belongs in PostHog, which is exactly what
  // the old bare `catch {}` prevented.
  return parseNotificationPreferencesActionResponse(
    response,
    rawPayload,
    fallbackMessage,
  );
}

const loadFailureMessage =
  "We couldn't load your notification preferences. Try again.";

const saveFailureMessage =
  "We couldn't save your notification preference. Try again.";

export const getNotificationPreferencesAction =
  defineServerAction<NotificationPreferences>({
    name: "getNotificationPreferences",
    failureMessage: loadFailureMessage,
    handler: () =>
      requestNotificationPreferences("GET", undefined, loadFailureMessage),
  });

export const setNotificationPreferenceAction = defineServerAction<
  NotificationPreferences,
  NotificationPreferenceUpdate
>({
  name: "setNotificationPreference",
  rateLimit: "mutation",
  input: notificationPreferenceUpdateSchema,
  failureMessage: saveFailureMessage,
  handler: (input) =>
    requestNotificationPreferences("PATCH", input, saveFailureMessage),
});
