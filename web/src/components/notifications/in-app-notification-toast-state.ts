import type { InAppNotificationConnection } from "../../lib/in-app-notifications";
import type { InAppNotification } from "../../schemas/notifications.schema";

export interface InAppNotificationToastState {
  readonly notification: InAppNotification | null;
  readonly queuedLabel: string | null;
  readonly showReconnectingStatus: boolean;
}

export interface InAppNotificationSurfacePropsState {
  readonly "aria-atomic": "true";
  readonly "aria-live": "polite";
  readonly className: string;
  readonly role: "status";
}

export function deriveInAppNotificationToastState(input: {
  readonly activeNotification: InAppNotification | null;
  readonly connection: InAppNotificationConnection;
  readonly queuedNotificationCount: number;
}): InAppNotificationToastState | null {
  const showReconnectingStatus = input.connection === "reconnecting";

  if (input.activeNotification === null && !showReconnectingStatus) {
    return null;
  }

  return {
    notification: input.activeNotification,
    queuedLabel:
      input.queuedNotificationCount > 0
        ? `${input.queuedNotificationCount} more waiting`
        : null,
    showReconnectingStatus,
  };
}

export function getInAppNotificationSurfaceProps(): InAppNotificationSurfacePropsState {
  return {
    "aria-atomic": "true",
    "aria-live": "polite",
    className:
      "pointer-events-auto w-full max-w-[380px] rounded-4xl border border-border bg-surface-raised text-foreground shadow-menu motion-safe:animate-[planning-slide-up_200ms_var(--ease-contentual)] motion-reduce:animate-none",
    role: "status",
  };
}
