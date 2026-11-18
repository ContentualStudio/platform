import { z } from "zod";
import { decodePendingInAppNotificationCursor } from "./in-app-notification.types";
import {
  notificationChannelOptions,
  notificationRegistry,
  notificationTypeOptions,
  type NotificationChannel,
} from "./notification-registry";

export const notificationPreferenceUpdateSchema = z
  .object({
    notificationType: z.enum(notificationTypeOptions),
    channel: z.enum(notificationChannelOptions),
    optedOut: z.boolean(),
  })
  .superRefine((value, context) => {
    const definition = notificationRegistry[value.notificationType];
    const channels = definition.channels as readonly NotificationChannel[];

    if (!channels.includes(value.channel)) {
      context.addIssue({
        code: "custom",
        message: `${value.channel} is not available for ${definition.label.toLowerCase()} notifications.`,
        path: ["channel"],
      });
    }
  });

export type NotificationPreferenceUpdate = z.infer<
  typeof notificationPreferenceUpdateSchema
>;

export const inAppNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const pendingInAppNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .refine((value) => {
      if (value === undefined) {
        return true;
      }

      try {
        decodePendingInAppNotificationCursor(value);
        return true;
      } catch {
        return false;
      }
    }, "The notification query is invalid."),
});

export const inAppNotificationIdSchema = z.string().trim().min(1);

export type InAppNotificationsQuery = z.infer<
  typeof inAppNotificationsQuerySchema
>;

export type PendingInAppNotificationsQuery = z.infer<
  typeof pendingInAppNotificationsQuerySchema
>;
