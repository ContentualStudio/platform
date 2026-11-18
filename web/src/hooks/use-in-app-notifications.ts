"use client";

import * as React from "react";
import {
  inAppNotificationStreamEventSchema,
  type InAppNotification,
  type InAppNotificationsResponse,
  type InAppNotificationStreamEvent,
  type PendingInAppNotificationsResponse,
} from "../schemas/notifications.schema";
import {
  dismissInAppNotification,
  fetchInAppNotifications,
  fetchPendingInAppNotifications,
  inAppNotificationStreamUrl,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
} from "../services/notifications.service";
import {
  advanceInAppNotificationQueue,
  clearQueuedInAppNotifications,
  enqueueInAppNotifications,
  initialInAppNotificationQueueState,
  markInAppNotificationShown,
  removeInAppNotificationFromQueue,
  type InAppNotificationQueueState,
} from "../lib/in-app-notification-queue";
import {
  initialInAppNotificationState,
  reduceInAppNotifications,
  type InAppNotificationState,
} from "../lib/in-app-notifications";

export interface UseInAppNotificationsResult extends InAppNotificationState {
  readonly activeNotification: InAppNotification | null;
  readonly queuedNotificationCount: number;
  readonly markRead: (id: string) => Promise<void>;
  readonly markAllRead: () => Promise<void>;
  readonly dismiss: (id: string) => Promise<void>;
  readonly completeActiveNotification: () => void;
  readonly dismissActiveNotification: () => Promise<void>;
}

export const IN_APP_NOTIFICATION_RETRY_DELAY_MS = 1_000;

export function parseInAppNotificationEvent(
  event: MessageEvent<unknown>,
): InAppNotificationStreamEvent | null {
  if (typeof event.data !== "string") {
    return null;
  }

  try {
    return inAppNotificationStreamEventSchema.parse(JSON.parse(event.data));
  } catch {
    return null;
  }
}

export function hydrateInAppNotificationPresentation(
  state: InAppNotificationQueueState,
  response: InAppNotificationsResponse,
  pendingNotifications: readonly InAppNotification[] = [],
): InAppNotificationQueueState {
  const authoritativeNotifications = [
    ...pendingNotifications,
    ...response.notifications,
  ];
  const authoritativeIds = new Set(
    authoritativeNotifications.map((notification) => notification.id),
  );
  const retainedActive =
    state.active && authoritativeIds.has(state.active.id) ? state.active : null;
  const rebuiltState: InAppNotificationQueueState = {
    active: retainedActive,
    queued: [],
    shownIds: state.shownIds,
  };

  return enqueueInAppNotifications(
    rebuiltState,
    authoritativeNotifications.filter(
      (notification) =>
        !notification.read && notification.id !== retainedActive?.id,
    ),
  );
}

export function applyInAppNotificationPresentationEvent(
  state: InAppNotificationQueueState,
  event: InAppNotificationStreamEvent,
): InAppNotificationQueueState {
  switch (event.type) {
    case "notification.created":
      return enqueueInAppNotifications(state, [event.notification]);
    case "notification.updated": {
      if (state.active?.id === event.notification.id) {
        return {
          ...state,
          active: event.notification,
        };
      }

      if (event.notification.read) {
        return removeInAppNotificationFromQueue(state, event.notification.id);
      }

      const queued = state.queued.map((notification) =>
        notification.id === event.notification.id
          ? event.notification
          : notification,
      );

      return queued.some(
        (notification, index) => notification !== state.queued[index],
      )
        ? { ...state, queued }
        : state;
    }
    case "notification.dismissed":
      return removeInAppNotificationFromQueue(state, event.notificationId);
    case "notifications.read_all":
      return clearQueuedInAppNotifications(state);
    default:
      return state;
  }
}

export async function drainPendingInAppNotifications(
  fetchPage: (
    cursor?: string,
  ) => Promise<PendingInAppNotificationsResponse>,
): Promise<readonly InAppNotification[]> {
  const notifications: InAppNotification[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    // Cursor pagination is intentionally sequential: each request depends on
    // the opaque cursor returned by the preceding page.
    // oxlint-disable-next-line no-await-in-loop
    const page = await fetchPage(cursor);

    for (const notification of page.notifications) {
      if (seenIds.has(notification.id)) {
        continue;
      }

      seenIds.add(notification.id);
      notifications.push(notification);
    }

    if (page.nextCursor === null) {
      return notifications;
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error("The notification cursor repeated during reconciliation.");
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function reconcileInAppNotificationRecovery(input: {
  readonly bufferedEvents: readonly InAppNotificationStreamEvent[];
  fetchSnapshot: () => Promise<InAppNotificationsResponse>;
  fetchPendingPage: (
    cursor?: string,
  ) => Promise<PendingInAppNotificationsResponse>;
}): Promise<{
  readonly response: InAppNotificationsResponse;
  readonly pendingNotifications: readonly InAppNotification[];
  readonly replayEvents: readonly InAppNotificationStreamEvent[];
}> {
  const response = await input.fetchSnapshot();
  const pendingNotifications = await drainPendingInAppNotifications(
    input.fetchPendingPage,
  );

  return {
    response,
    pendingNotifications,
    replayEvents: [...input.bufferedEvents],
  };
}

export function createInAppNotificationRetryScheduler(input?: {
  delayMs?: number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearScheduledTimeout?: (handle: unknown) => void;
}) {
  const delayMs = input?.delayMs ?? IN_APP_NOTIFICATION_RETRY_DELAY_MS;
  const scheduleTimeout =
    input?.scheduleTimeout ??
    ((callback: () => void, nextDelayMs: number) =>
      setTimeout(callback, nextDelayMs));
  const clearScheduledTimeout =
    input?.clearScheduledTimeout ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let disposed = false;
  let retryHandle: unknown = null;

  return {
    schedule(callback: () => void) {
      if (disposed || retryHandle !== null) {
        return;
      }

      retryHandle = scheduleTimeout(() => {
        retryHandle = null;
        if (disposed) {
          return;
        }

        callback();
      }, delayMs);
    },
    clear() {
      if (retryHandle === null) {
        return;
      }

      clearScheduledTimeout(retryHandle);
      retryHandle = null;
    },
    dispose() {
      disposed = true;
      this.clear();
    },
    hasScheduledRetry() {
      return retryHandle !== null;
    },
  };
}

export function scheduleInAppNotificationRecoveryRetry(input: {
  streamIsOpen: boolean;
  retryScheduler: {
    schedule: (callback: () => void) => void;
  };
  reconcile: () => void | Promise<void>;
}): boolean {
  if (!input.streamIsOpen) {
    return false;
  }

  input.retryScheduler.schedule(() => {
    void input.reconcile();
  });

  return true;
}

export function canCommitInAppNotificationRecovery(input: {
  readonly streamIsOpen: boolean;
}): boolean {
  return input.streamIsOpen;
}

export function useInAppNotifications(): UseInAppNotificationsResult {
  const [state, dispatch] = React.useReducer(
    reduceInAppNotifications,
    initialInAppNotificationState,
  );
  const [presentation, setPresentation] = React.useState(
    initialInAppNotificationQueueState,
  );

  const applyStreamEvent = React.useCallback((event: InAppNotificationStreamEvent) => {
    dispatch({ type: "stream", event });
    setPresentation((current) =>
      applyInAppNotificationPresentationEvent(current, event),
    );
  }, []);

  React.useEffect(() => {
    let disposed = false;
    let hasOpened = false;
    let hasCompletedHydration = false;
    let streamIsOpen = false;
    let reconciliationPending = true;
    let reconciliation: Promise<void> | null = null;
    const bufferedEvents: InAppNotificationStreamEvent[] = [];
    const retryScheduler = createInAppNotificationRetryScheduler();
    const source = new EventSource(inAppNotificationStreamUrl(), {
      withCredentials: true,
    });

    const dispatchStreamEvent = (event: InAppNotificationStreamEvent) => {
      if (reconciliationPending) {
        bufferedEvents.push(event);
        return;
      }

      applyStreamEvent(event);
    };

    const reconcile = async () => {
      if (reconciliation) {
        return reconciliation;
      }

      reconciliationPending = true;
      const request = (async () => {
        try {
          const recovery = await reconcileInAppNotificationRecovery({
            bufferedEvents,
            fetchSnapshot: fetchInAppNotifications,
            fetchPendingPage: (cursor) => fetchPendingInAppNotifications(cursor),
          });
          if (disposed) {
            return;
          }

          if (!canCommitInAppNotificationRecovery({ streamIsOpen })) {
            dispatch({ type: "connection", connection: "reconnecting" });
            return;
          }

          retryScheduler.clear();
          dispatch({ type: "hydrate", response: recovery.response });
          setPresentation((current) =>
            hydrateInAppNotificationPresentation(
              current,
              recovery.response,
              recovery.pendingNotifications,
            ),
          );
          const pending = bufferedEvents.splice(0, recovery.replayEvents.length);
          reconciliationPending = false;
          pending.forEach((event) => applyStreamEvent(event));
          hasCompletedHydration = true;
          dispatch({ type: "connection", connection: "ready" });
        } catch {
          if (disposed) {
            return;
          }
          scheduleInAppNotificationRecoveryRetry({
            streamIsOpen,
            retryScheduler,
            reconcile,
          });
          dispatch({
            type: "connection",
            connection: hasCompletedHydration ? "reconnecting" : "error",
          });
        } finally {
          reconciliation = null;
        }
      })();

      reconciliation = request;
      return request;
    };

    const eventNames = [
      "notification.created",
      "notification.updated",
      "notification.dismissed",
      "notifications.read_all",
      "heartbeat",
    ] as const;
    const listeners = eventNames.map((eventName) => {
      const listener = (event: Event) => {
        const parsed = parseInAppNotificationEvent(event as MessageEvent<unknown>);
        if (parsed) {
          dispatchStreamEvent(parsed);
        }
      };
      source.addEventListener(eventName, listener);
      return { eventName, listener };
    });

    source.onopen = () => {
      if (disposed) {
        return;
      }

      streamIsOpen = true;
      const reconnect = hasOpened;
      hasOpened = true;
      dispatch({
        type: "connection",
        connection: reconnect ? "reconnecting" : "loading",
      });
      void reconcile();
    };

    source.onerror = () => {
      if (disposed) {
        return;
      }

      streamIsOpen = false;
      reconciliationPending = true;
      retryScheduler.clear();
      dispatch({ type: "connection", connection: "reconnecting" });
    };

    return () => {
      disposed = true;
      streamIsOpen = false;
      reconciliationPending = true;
      retryScheduler.dispose();
      for (const { eventName, listener } of listeners) {
        source.removeEventListener(eventName, listener);
      }
      source.close();
    };
  }, [applyStreamEvent]);

  const activeNotification = presentation.active;

  React.useEffect(() => {
    const activeId = activeNotification?.id ?? null;

    if (activeId === null) {
      return;
    }

    setPresentation((current) => markInAppNotificationShown(current, activeId));

    if (activeNotification?.read) {
      return;
    }

    void markInAppNotificationRead(activeId)
      .then((response) => {
        applyStreamEvent({
          type: "notification.updated",
          notification: response.notification,
          unreadCount: response.unreadCount,
        });
      })
      .catch(() => undefined);
  }, [activeNotification?.id, activeNotification?.read, applyStreamEvent]);

  const markRead = React.useCallback(async (id: string) => {
    const response = await markInAppNotificationRead(id);
    applyStreamEvent({
      type: "notification.updated",
      notification: response.notification,
      unreadCount: response.unreadCount,
    });
  }, [applyStreamEvent]);

  const markAllRead = React.useCallback(async () => {
    const response = await markAllInAppNotificationsRead();
    dispatch({ type: "hydrate", response });
    setPresentation((current) =>
      clearQueuedInAppNotifications(
        hydrateInAppNotificationPresentation(current, response),
      ),
    );
  }, []);

  const dismiss = React.useCallback(async (id: string) => {
    const response = await dismissInAppNotification(id);
    applyStreamEvent({
      type: "notification.dismissed",
      notificationId: response.notificationId,
      unreadCount: response.unreadCount,
    });
  }, [applyStreamEvent]);

  const completeActiveNotification = React.useCallback(() => {
    setPresentation((current) => advanceInAppNotificationQueue(current));
  }, []);

  const dismissActiveNotification = React.useCallback(async () => {
    const activeId = presentation.active?.id ?? null;

    if (activeId === null) {
      return;
    }

    setPresentation((current) => removeInAppNotificationFromQueue(current, activeId));
    try {
      await dismiss(activeId);
    } catch {
      // Presentation advances optimistically. The row remains in the inbox
      // when the mutation fails and can be retried from the bell.
    }
  }, [dismiss, presentation.active?.id]);

  return {
    ...state,
    activeNotification,
    queuedNotificationCount: presentation.queued.length,
    markRead,
    markAllRead,
    dismiss,
    completeActiveNotification,
    dismissActiveNotification,
  };
}
