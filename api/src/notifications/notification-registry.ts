export const notificationChannelOptions = ["in_app", "email"] as const;

export type NotificationChannel = (typeof notificationChannelOptions)[number];

export const notificationRegistry = {
  daily_task_notice: {
    label: "Daily task notice",
    description: "Reminder when your daily challenge is ready",
    channels: ["in_app", "email"] as const,
    defaultOptedOut: false,
  },
  badge_earned: {
    label: "Badge earned",
    description: "When you unlock a new achievement badge",
    channels: ["in_app"] as const,
    defaultOptedOut: false,
  },
  streak_at_risk: {
    label: "Streak at risk",
    description: "Warning when your posting streak may break",
    channels: ["in_app", "email"] as const,
    defaultOptedOut: false,
  },
  milestone_reached: {
    label: "Milestone reached",
    description: "Follower milestones and growth highlights",
    channels: ["in_app", "email"] as const,
    defaultOptedOut: false,
  },
} as const;

export const notificationTypeOptions = Object.keys(
  notificationRegistry,
) as [NotificationType, ...NotificationType[]];

export type NotificationType = keyof typeof notificationRegistry;

/**
 * Account-critical messages are deliberately not registry entries. They must
 * not become suppressible when product-notification preferences change.
 */
export const accountCriticalEmailTypes = new Set([
  "login_code",
  "account_security",
  "password_reset",
]);

export function channelLabel(channel: NotificationChannel): string {
  return channel === "in_app" ? "In-app" : "Email";
}

export function getNotificationRegistry() {
  return notificationTypeOptions.map((type) => ({
    type,
    ...notificationRegistry[type],
    channels: notificationRegistry[type].channels.map((channel) => ({
      channel,
      label: channelLabel(channel),
    })),
  }));
}
