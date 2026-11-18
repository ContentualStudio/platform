"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { isSafeInternalActionUrl } from "@/lib/internal-action-url";
import type { InAppNotification } from "@/schemas/notifications.schema";
import {
  type InAppNotificationToastController,
  type InAppNotificationSurfaceMap,
} from "./in-app-notifications-provider";
import {
  deriveInAppNotificationToastState,
  getInAppNotificationSurfaceProps,
} from "./in-app-notification-toast-state";

export const IN_APP_NOTIFICATION_TOAST_DURATION_MS = 4_500;

function BaseInAppNotificationToast({
  notification,
  onAction,
  onDismiss,
  queuedLabel,
}: {
  readonly notification: InAppNotification;
  readonly onAction: () => void;
  readonly onDismiss: () => void;
  readonly queuedLabel: string | null;
}) {
  return (
    <div
      className="flex flex-col gap-3 px-4.5 py-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-sm font-semibold text-foreground">
            {notification.title}
          </p>
          <p className="text-sm leading-body text-muted">
            {notification.description}
          </p>
        </div>
        <button
          aria-label="Dismiss notification"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200 ease-contentual hover:bg-control"
          onClick={onDismiss}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      {notification.actionUrl || queuedLabel ? (
        <div className="flex items-center justify-between gap-3">
          {notification.actionUrl ? (
            <button
              className="text-sm font-semibold text-accent transition-opacity duration-200 ease-contentual hover:opacity-80"
              onClick={onAction}
              type="button"
            >
              View
            </button>
          ) : (
            <span />
          )}
          {queuedLabel ? (
            <p className="text-xs text-muted">{queuedLabel}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InAppNotificationToast({
  controller,
  surfaceMap,
}: {
  readonly controller: InAppNotificationToastController;
  readonly surfaceMap?: InAppNotificationSurfaceMap;
}) {
  const router = useRouter();
  const {
    activeNotification,
    completeActiveNotification,
    connection,
    dismissActiveNotification,
    queuedNotificationCount,
  } = controller;
  const [mounted, setMounted] = React.useState(false);
  const activeNotificationId = activeNotification?.id ?? null;

  const toastState = deriveInAppNotificationToastState({
    activeNotification,
    connection,
    queuedNotificationCount,
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (activeNotificationId === null) {
      return;
    }

    const timer = setTimeout(() => {
      completeActiveNotification();
    }, IN_APP_NOTIFICATION_TOAST_DURATION_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [activeNotificationId, completeActiveNotification]);

  const handleAction = React.useCallback(
    (notification: InAppNotification) => {
      if (!notification.actionUrl) {
        return;
      }

      if (!isSafeInternalActionUrl(notification.actionUrl)) {
        return;
      }

      completeActiveNotification();
      router.push(notification.actionUrl);
    },
    [completeActiveNotification, router],
  );

  const handleDismiss = React.useCallback(() => {
    void dismissActiveNotification();
  }, [dismissActiveNotification]);

  if (!mounted || toastState === null) {
    return null;
  }

  const notification = toastState.notification;
  const surfaceProps = getInAppNotificationSurfaceProps();
  const surface =
    notification?.type === null || notification === null
      ? null
      : surfaceMap?.[notification.type] ?? null;

  return createPortal(
    <section className="pointer-events-none fixed right-4 top-16 z-200 flex w-[calc(100vw-2rem)] max-w-[380px] flex-col items-end gap-2">
      {toastState.showReconnectingStatus ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="rounded-full bg-surface-raised px-3 py-1 text-xs font-medium text-muted shadow-menu motion-safe:animate-[planning-slide-up_200ms_var(--ease-contentual)] motion-reduce:animate-none"
          role="status"
        >
          Reconnecting…
        </p>
      ) : null}
      {notification
        ? (
          <div {...surfaceProps}>
            {surface?.({
              notification,
              onAction: () => handleAction(notification),
              onDismiss: handleDismiss,
            }) ?? (
              <BaseInAppNotificationToast
                notification={notification}
                onAction={() => handleAction(notification)}
                onDismiss={handleDismiss}
                queuedLabel={toastState.queuedLabel}
              />
            )}
          </div>
        )
        : null}
    </section>,
    document.body,
  );
}
