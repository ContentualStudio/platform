import type {
  InAppNotification,
  InAppNotificationStreamEvent,
  InAppNotificationsResponse,
} from "../schemas/notifications.schema";

export type InAppNotificationConnection =
  | "loading"
  | "ready"
  | "reconnecting"
  | "error";

export interface InAppNotificationState {
  readonly items: readonly InAppNotification[];
  readonly unreadCount: number;
  readonly connection: InAppNotificationConnection;
}

export type InAppNotificationAction =
  | { readonly type: "hydrate"; readonly response: InAppNotificationsResponse }
  | {
      readonly type: "stream";
      readonly event: InAppNotificationStreamEvent;
    }
  | {
      readonly type: "connection";
      readonly connection: InAppNotificationConnection;
    };

export const initialInAppNotificationState: InAppNotificationState = {
  items: [],
  unreadCount: 0,
  connection: "loading",
};

function newestFirst(
  items: readonly InAppNotification[],
): readonly InAppNotification[] {
  return [...items].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}

function reduceStream(
  state: InAppNotificationState,
  event: InAppNotificationStreamEvent,
): InAppNotificationState {
  switch (event.type) {
    case "heartbeat":
      return state;
    case "notification.created": {
      const exists = state.items.some((item) => item.id === event.notification.id);
      return {
        ...state,
        items: exists
          ? state.items
          : newestFirst([...state.items, event.notification]),
        unreadCount: event.unreadCount,
      };
    }
    case "notification.updated":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === event.notification.id ? event.notification : item,
        ),
        unreadCount: event.unreadCount,
      };
    case "notification.dismissed":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== event.notificationId),
        unreadCount: event.unreadCount,
      };
    case "notifications.read_all":
      return {
        ...state,
        items: state.items.map((item) => ({ ...item, read: true })),
        unreadCount: event.unreadCount,
      };
  }
}

export function reduceInAppNotifications(
  state: InAppNotificationState,
  action: InAppNotificationAction,
): InAppNotificationState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        items: newestFirst(action.response.notifications),
        unreadCount: action.response.unreadCount,
        connection: "ready",
      };
    case "stream":
      return reduceStream(state, action.event);
    case "connection":
      return { ...state, connection: action.connection };
  }
}
