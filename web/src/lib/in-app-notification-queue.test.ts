import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { InAppNotification } from "../schemas/notifications.schema";
import {
  advanceInAppNotificationQueue,
  clearQueuedInAppNotifications,
  enqueueInAppNotifications,
  initialInAppNotificationQueueState,
  markInAppNotificationShown,
  removeInAppNotificationFromQueue,
} from "./in-app-notification-queue";

const newest: InAppNotification = {
  id: "newest",
  type: "badge_earned" as const,
  title: "Newest",
  description: "Second message",
  actionUrl: null,
  read: false,
  createdAt: "2026-08-10T10:02:00.000Z",
};
const oldest: InAppNotification = {
  ...newest,
  id: "oldest",
  title: "Oldest",
  createdAt: "2026-08-10T10:01:00.000Z",
};
const tieBreakerA: InAppNotification = {
  ...newest,
  id: "a-tie",
  title: "Tie A",
  createdAt: "2026-08-10T10:03:00.000Z",
};
const tieBreakerB: InAppNotification = {
  ...newest,
  id: "b-tie",
  title: "Tie B",
  createdAt: "2026-08-10T10:03:00.000Z",
};
const readNotification: InAppNotification = {
  ...newest,
  id: "read-item",
  title: "Read item",
  read: true,
};

test("queues unread hydration oldest first and ignores duplicate replay", () => {
  const first = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [newest, oldest],
  );
  const replay = enqueueInAppNotifications(first, [oldest, newest]);

  assert.equal(first.active?.id, "oldest");
  assert.deepEqual(first.queued.map((item) => item.id), ["newest"]);
  assert.deepEqual(replay, first);
});

test("hydrates by createdAt then id and filters read notifications", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [tieBreakerB, readNotification, tieBreakerA],
  );

  assert.equal(state.active?.id, "a-tie");
  assert.deepEqual(state.queued.map((item) => item.id), ["b-tie"]);
});

test("shown notifications are not requeued during reconnect hydration", () => {
  const active = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest],
  );
  const shown = markInAppNotificationShown(active, "oldest");

  assert.deepEqual(enqueueInAppNotifications(shown, [oldest]), shown);
});

test("clearQueuedInAppNotifications clears queued items but keeps active visible", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest, newest],
  );
  const cleared = clearQueuedInAppNotifications(state);

  assert.equal(cleared.active?.id, "oldest");
  assert.deepEqual(cleared.queued, []);
});

test("shown ids are preserved across removal and clear so replay is ignored", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest, newest],
  );
  const shown = markInAppNotificationShown(state, "oldest");
  const removed = removeInAppNotificationFromQueue(shown, "oldest");
  const cleared = clearQueuedInAppNotifications(shown);

  assert.equal(removed.active?.id, "newest");
  assert.equal(cleared.active?.id, "oldest");
  assert.deepEqual(enqueueInAppNotifications(removed, [oldest]), removed);
  assert.deepEqual(enqueueInAppNotifications(cleared, [oldest]), cleared);
});

test("a created event appends after hydrated unread messages", () => {
  const hydrated = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest],
  );
  const created = { ...newest, id: "created-during-gap" };
  const state = enqueueInAppNotifications(hydrated, [created]);

  assert.deepEqual(
    [state.active?.id, ...state.queued.map((item) => item.id)],
    ["oldest", "created-during-gap"],
  );
});

test("a dismiss event removes a queued notification", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest, newest],
  );
  const afterDismiss = removeInAppNotificationFromQueue(state, "newest");

  assert.equal(afterDismiss.active?.id, "oldest");
  assert.deepEqual(afterDismiss.queued, []);
});

test("advancing clears the active notification when nothing is queued", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest],
  );
  const advanced = advanceInAppNotificationQueue(state);

  assert.equal(advanced.active, null);
  assert.deepEqual(advanced.queued, []);
});

test("advancing and dismissing preserve FIFO order", () => {
  const state = enqueueInAppNotifications(
    initialInAppNotificationQueueState,
    [oldest, newest],
  );
  const next = advanceInAppNotificationQueue(state);
  const dismissed = removeInAppNotificationFromQueue(next, "newest");

  assert.equal(next.active?.id, "newest");
  assert.equal(dismissed.active, null);
});
