import { ActionFailure } from "./server/result";
import {
  notificationPreferencesResponseSchema,
  type NotificationPreferencesResponse,
} from "../schemas/notifications.schema";

export type NotificationPreferences =
  NotificationPreferencesResponse["preferences"];

/**
 * Turns the api's answer into preferences, or into a named failure.
 *
 * Both failure paths raise `ActionFailure` rather than returning a result, so the
 * shared action wrapper renders them as the api described them instead of
 * reporting them to PostHog as bugs. An api refusal and a response this app
 * cannot parse are both answers, not faults — the second is a contract mismatch
 * worth surfacing to the user, but it is not an unhandled throw.
 */
export function parseNotificationPreferencesActionResponse(
  response: Response,
  rawPayload: unknown,
  fallbackMessage: string,
): NotificationPreferences {
  if (!response.ok) {
    const payload = rawPayload as {
      code?: unknown;
      message?: unknown;
    };

    throw new ActionFailure(
      typeof payload.code === "string"
        ? payload.code
        : "NOTIFICATION_REQUEST_FAILED",
      typeof payload.message === "string" ? payload.message : fallbackMessage,
    );
  }

  const parsed = notificationPreferencesResponseSchema.safeParse(rawPayload);

  if (!parsed.success) {
    throw new ActionFailure("INVALID_NOTIFICATION_RESPONSE", fallbackMessage);
  }

  return parsed.data.preferences;
}
