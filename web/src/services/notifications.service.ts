import { apiBaseUrl, apiFetch } from "../lib/api-client";
import {
  dismissInAppNotificationResponseSchema,
  inAppNotificationMutationResponseSchema,
  inAppNotificationsResponseSchema,
  notificationPreferenceUpdateSchema,
  notificationPreferencesResponseSchema,
  pendingInAppNotificationsResponseSchema,
  type DismissInAppNotificationResponse,
  type InAppNotificationMutationResponse,
  type InAppNotificationsResponse,
  type NotificationPreferenceUpdate,
  type NotificationPreferencesResponse,
  type PendingInAppNotificationsResponse,
} from "../schemas/notifications.schema";

export class NotificationsServiceError extends Error {
  constructor(
    message: string,
    readonly code = "NOTIFICATION_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "NotificationsServiceError";
  }
}

function assertSuccessful(
  response: Response,
  rawPayload: unknown,
  fallbackMessage: string,
): void {
  if (!response.ok) {
    const payload = rawPayload as { code?: string; message?: string };

    throw new NotificationsServiceError(
      payload.message ?? fallbackMessage,
      payload.code,
    );
  }
}

function parsePreferencesResponse(
  response: Response,
  rawPayload: unknown,
): NotificationPreferencesResponse {
  assertSuccessful(
    response,
    rawPayload,
    "We couldn't update your notification preferences.",
  );

  return notificationPreferencesResponseSchema.parse(rawPayload);
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const result = await apiFetch("/notifications/preferences");
  return parsePreferencesResponse(result.response, result.rawPayload);
}

export async function updateNotificationPreference(
  input: NotificationPreferenceUpdate,
): Promise<NotificationPreferencesResponse> {
  const body = notificationPreferenceUpdateSchema.parse(input);
  const result = await apiFetch("/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return parsePreferencesResponse(result.response, result.rawPayload);
}

export async function fetchInAppNotifications(
  limit = 50,
): Promise<InAppNotificationsResponse> {
  const result = await apiFetch(
    `/notifications/in-app?limit=${encodeURIComponent(String(limit))}`,
  );
  assertSuccessful(
    result.response,
    result.rawPayload,
    "We couldn't load your notifications.",
  );
  return inAppNotificationsResponseSchema.parse(result.rawPayload);
}

export async function fetchPendingInAppNotifications(
  cursor?: string,
  limit = 50,
): Promise<PendingInAppNotificationsResponse> {
  const cursorQuery =
    cursor === undefined
      ? ""
      : `&cursor=${encodeURIComponent(cursor)}`;
  const result = await apiFetch(
    `/notifications/in-app/pending?limit=${encodeURIComponent(String(limit))}${cursorQuery}`,
  );
  assertSuccessful(
    result.response,
    result.rawPayload,
    "We couldn't load your notifications.",
  );
  return pendingInAppNotificationsResponseSchema.parse(result.rawPayload);
}

export async function markInAppNotificationRead(
  id: string,
): Promise<InAppNotificationMutationResponse> {
  const result = await apiFetch(
    `/notifications/in-app/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
  assertSuccessful(
    result.response,
    result.rawPayload,
    "We couldn't mark the notification as read.",
  );
  return inAppNotificationMutationResponseSchema.parse(result.rawPayload);
}

export async function markAllInAppNotificationsRead(): Promise<InAppNotificationsResponse> {
  const result = await apiFetch("/notifications/in-app/read-all", {
    method: "POST",
  });
  assertSuccessful(
    result.response,
    result.rawPayload,
    "We couldn't mark your notifications as read.",
  );
  return inAppNotificationsResponseSchema.parse(result.rawPayload);
}

export async function dismissInAppNotification(
  id: string,
): Promise<DismissInAppNotificationResponse> {
  const result = await apiFetch(
    `/notifications/in-app/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  assertSuccessful(
    result.response,
    result.rawPayload,
    "We couldn't dismiss the notification.",
  );
  return dismissInAppNotificationResponseSchema.parse(result.rawPayload);
}

export function inAppNotificationStreamUrl(): string {
  return `${apiBaseUrl}/notifications/in-app/stream`;
}
