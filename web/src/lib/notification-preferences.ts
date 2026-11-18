import type {
  NotificationChannel,
  NotificationPreference,
} from "../schemas/notifications.schema";

export function notificationPreferenceKey(
  type: string,
  channel: NotificationChannel["channel"],
): string {
  return `${type}:${channel}`;
}

export function toggleNotificationPreference(
  preferences: readonly NotificationPreference[],
  type: string,
  channel: NotificationChannel["channel"],
): NotificationPreference[] {
  return preferences.map((preference) =>
    preference.type === type
      ? {
          ...preference,
          channels: preference.channels.map((item) =>
            item.channel === channel
              ? { ...item, optedOut: !item.optedOut }
              : item,
          ),
        }
      : { ...preference, channels: [...preference.channels] },
  );
}
