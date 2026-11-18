import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { InAppNotification } from "../../schemas/notifications.schema";
import {
  deriveInAppNotificationToastState,
  getInAppNotificationSurfaceProps,
} from "./in-app-notification-toast-state";

const notification: InAppNotification = {
  id: "toast-1",
  type: "badge_earned",
  title: "Badge earned",
  description: "You unlocked a badge.",
  actionUrl: "/achievements",
  read: false,
  createdAt: "2026-08-10T10:00:00.000Z",
};

test("stays quiet when there is no active notification and the stream is not reconnecting", () => {
  assert.equal(
    deriveInAppNotificationToastState({
      activeNotification: null,
      connection: "ready",
      queuedNotificationCount: 0,
    }),
    null,
  );
});

test("shows reconnecting status even without an active notification", () => {
  assert.deepEqual(
    deriveInAppNotificationToastState({
      activeNotification: null,
      connection: "reconnecting",
      queuedNotificationCount: 0,
    }),
    {
      notification: null,
      queuedLabel: null,
      showReconnectingStatus: true,
    },
  );
});

test("includes the active notification and queued count copy", () => {
  assert.deepEqual(
    deriveInAppNotificationToastState({
      activeNotification: notification,
      connection: "ready",
      queuedNotificationCount: 2,
    }),
    {
      notification,
      queuedLabel: "2 more waiting",
      showReconnectingStatus: false,
    },
  );
});

test("shared surface props preserve live-region and pointer semantics for all renderer paths", () => {
  assert.deepEqual(getInAppNotificationSurfaceProps(), {
    "aria-atomic": "true",
    "aria-live": "polite",
    className:
      "pointer-events-auto w-full max-w-[380px] rounded-4xl border border-border bg-surface-raised text-foreground shadow-menu motion-safe:animate-[planning-slide-up_200ms_var(--ease-contentual)] motion-reduce:animate-none",
    role: "status",
  });
});
