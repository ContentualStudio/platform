import { z } from "zod";
import { isSafeInternalActionUrl } from "../lib/internal-action-url";

export const notificationTypeOptions = [
  "daily_task_notice",
  "badge_earned",
  "streak_at_risk",
  "milestone_reached",
] as const;

export const notificationChannelOptions = ["in_app", "email"] as const;

const notificationPreferenceTypeSchema = z.string().trim().min(1);

const notificationChannelSchema = z.object({
  channel: z.enum(notificationChannelOptions),
  label: z.string(),
  optedOut: z.boolean(),
  defaultOptedOut: z.boolean(),
});

const notificationPreferenceSchema = z.object({
  type: notificationPreferenceTypeSchema,
  label: z.string(),
  description: z.string(),
  channels: z.array(notificationChannelSchema).min(1),
});

export const notificationPreferencesResponseSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});

export const notificationPreferenceUpdateSchema = z.object({
  notificationType: notificationPreferenceTypeSchema,
  channel: z.enum(notificationChannelOptions),
  optedOut: z.boolean(),
});

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;
export type NotificationPreferencesResponse = z.infer<
  typeof notificationPreferencesResponseSchema
>;
export type NotificationPreferenceUpdate = z.infer<
  typeof notificationPreferenceUpdateSchema
>;

export const inAppNotificationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(notificationTypeOptions).nullable(),
  title: z.string(),
  description: z.string(),
  actionUrl: z
    .string()
    .refine(isSafeInternalActionUrl, "The notification action URL is invalid.")
    .nullable(),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});

export const inAppNotificationsResponseSchema = z.object({
  notifications: z.array(inAppNotificationSchema),
  unreadCount: z.number().int().nonnegative(),
});

export const pendingInAppNotificationsResponseSchema = z.object({
  notifications: z.array(inAppNotificationSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const inAppNotificationMutationResponseSchema = z.object({
  notification: inAppNotificationSchema,
  unreadCount: z.number().int().nonnegative(),
});

export const dismissInAppNotificationResponseSchema = z.object({
  notificationId: z.string().min(1),
  unreadCount: z.number().int().nonnegative(),
});

export const inAppNotificationStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notification.created"),
    notification: inAppNotificationSchema,
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification.updated"),
    notification: inAppNotificationSchema,
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification.dismissed"),
    notificationId: z.string().min(1),
    unreadCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notifications.read_all"),
    unreadCount: z.literal(0),
  }),
  z.object({ type: z.literal("heartbeat") }),
]);

export type InAppNotification = z.infer<typeof inAppNotificationSchema>;
export type InAppNotificationsResponse = z.infer<
  typeof inAppNotificationsResponseSchema
>;
export type PendingInAppNotificationsResponse = z.infer<
  typeof pendingInAppNotificationsResponseSchema
>;
export type InAppNotificationMutationResponse = z.infer<
  typeof inAppNotificationMutationResponseSchema
>;
export type DismissInAppNotificationResponse = z.infer<
  typeof dismissInAppNotificationResponseSchema
>;
export type InAppNotificationStreamEvent = z.infer<
  typeof inAppNotificationStreamEventSchema
>;
