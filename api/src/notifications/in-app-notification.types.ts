import type { EntityManager } from "typeorm";
import type { NotificationType } from "./notification-registry";

export interface InAppNotificationView {
  readonly id: string;
  readonly type: NotificationType | null;
  readonly title: string;
  readonly description: string;
  readonly actionUrl: string | null;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface InAppNotificationsResponse {
  readonly notifications: readonly InAppNotificationView[];
  readonly unreadCount: number;
}

export interface PendingInAppNotificationsResponse {
  readonly notifications: readonly InAppNotificationView[];
  readonly nextCursor: string | null;
}

export interface InAppNotificationMutationResponse {
  readonly notification: InAppNotificationView;
  readonly unreadCount: number;
}

export interface DismissInAppNotificationResponse {
  readonly notificationId: string;
  readonly unreadCount: number;
}

export type InAppNotificationStreamEvent =
  | {
      readonly type: "notification.created";
      readonly notification: InAppNotificationView;
      readonly unreadCount: number;
    }
  | {
      readonly type: "notification.updated";
      readonly notification: InAppNotificationView;
      readonly unreadCount: number;
    }
  | {
      readonly type: "notification.dismissed";
      readonly notificationId: string;
      readonly unreadCount: number;
    }
  | { readonly type: "notifications.read_all"; readonly unreadCount: 0 }
  | { readonly type: "heartbeat" };

export interface CreateInAppNotificationInput {
  readonly userId: string;
  readonly notificationType: NotificationType | null;
  readonly title: string;
  readonly message: string;
  readonly actionUrl?: string | null;
  readonly dedupeKey: string;
  readonly sourceEngineMessageId?: string | null;
  readonly sourceRuleId?: string | null;
  readonly sourceEventId?: string | null;
}

export const NOTIFICATIONS_REALTIME_PUBLISHER = Symbol(
  "NOTIFICATIONS_REALTIME_PUBLISHER",
);

export interface NotificationsRealtimePublisher {
  enqueue(
    manager: EntityManager,
    userId: string,
    event: InAppNotificationStreamEvent,
  ): Promise<void>;
}

interface PendingInAppNotificationCursorPayload {
  readonly createdAt: string;
  readonly id: string;
}

export interface PendingInAppNotificationCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export function encodePendingInAppNotificationCursor(input: {
  readonly createdAt: Date | string;
  readonly id: string;
}): string {
  const payload: PendingInAppNotificationCursorPayload = {
    createdAt: new Date(input.createdAt).toISOString(),
    id: input.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodePendingInAppNotificationCursor(
  cursor: string,
): PendingInAppNotificationCursor {
  let payload: unknown;

  try {
    payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    throw new Error("The notification cursor is invalid.");
  }

  const record = payload as { createdAt?: unknown; id?: unknown };
  const createdAt =
    typeof record.createdAt === "string"
      ? new Date(record.createdAt)
      : new Date(Number.NaN);

  if (
    Number.isNaN(createdAt.getTime()) ||
    typeof record.id !== "string" ||
    record.id.trim().length === 0
  ) {
    throw new Error("The notification cursor is invalid.");
  }

  return {
    createdAt,
    id: record.id,
  };
}
