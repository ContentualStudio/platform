import * as assert from "node:assert/strict";
import { test } from "node:test";
import { inAppNotificationSchema } from "../schemas/notifications.schema";
import {
  initialInAppNotificationState,
  reduceInAppNotifications,
} from "./in-app-notifications";

const item = {
  id: "n1",
  type: "badge_earned" as const,
  title: "Badge earned",
  description: "You unlocked a badge.",
  actionUrl: "/achievements",
  read: false,
  createdAt: "2026-08-10T10:00:00.000Z",
};
const snapshot = { notifications: [item], unreadCount: 1 };

test("a created event is inserted once when SSE reconnects and replays it", () => {
  const hydrated = reduceInAppNotifications(
    initialInAppNotificationState,
    { type: "hydrate", response: snapshot },
  );
  const state = reduceInAppNotifications(hydrated, {
    type: "stream",
    event: { type: "notification.created", notification: item, unreadCount: 1 },
  });

  assert.deepEqual(state.items, [item]);
  assert.equal(state.unreadCount, 1);
});

test("hydrate replaces a notification dismissed while disconnected", () => {
  const state = reduceInAppNotifications(
    reduceInAppNotifications(initialInAppNotificationState, {
      type: "hydrate",
      response: snapshot,
    }),
    { type: "hydrate", response: { notifications: [], unreadCount: 0 } },
  );

  assert.deepEqual(state.items, []);
  assert.equal(state.unreadCount, 0);
});

test("validated events buffered during hydration replay after replacement", () => {
  const buffered = { ...item, id: "committed-during-gap" };
  const hydrated = reduceInAppNotifications(initialInAppNotificationState, {
    type: "hydrate",
    response: { notifications: [], unreadCount: 0 },
  });
  const state = reduceInAppNotifications(hydrated, {
    type: "stream",
    event: {
      type: "notification.created",
      notification: buffered,
      unreadCount: 1,
    },
  });

  assert.deepEqual(state.items.map((notification) => notification.id), [
    "committed-during-gap",
  ]);
  assert.equal(state.unreadCount, 1);
});

test("read and dismiss events use their authoritative totals", () => {
  const state = reduceInAppNotifications(initialInAppNotificationState, {
    type: "hydrate",
    response: {
      notifications: [
        item,
        { ...item, id: "n2", type: "streak_at_risk", actionUrl: null },
      ],
      unreadCount: 75,
    },
  });
  const read = reduceInAppNotifications(state, {
    type: "stream",
    event: {
      type: "notification.updated",
      notification: { ...item, read: true },
      unreadCount: 74,
    },
  });
  const dismissed = reduceInAppNotifications(read, {
    type: "stream",
    event: {
      type: "notification.dismissed",
      notificationId: "outside-page",
      unreadCount: 73,
    },
  });

  assert.equal(dismissed.unreadCount, 73);
  assert.equal(dismissed.items.find((row) => row.id === "n1")?.read, true);
});

test("server unread total is preserved when the page is limited", () => {
  const page = {
    notifications: Array.from({ length: 50 }, (_, index) => ({
      ...item,
      id: `n${index}`,
    })),
    unreadCount: 75,
  };
  const state = reduceInAppNotifications(initialInAppNotificationState, {
    type: "hydrate",
    response: page,
  });

  assert.equal(state.items.length, 50);
  assert.equal(state.unreadCount, 75);
});

test("read-all updates loaded rows for another tab", () => {
  const state = reduceInAppNotifications(initialInAppNotificationState, {
    type: "hydrate",
    response: { notifications: [item, { ...item, id: "n2" }], unreadCount: 2 },
  });
  const readAll = reduceInAppNotifications(state, {
    type: "stream",
    event: { type: "notifications.read_all", unreadCount: 0 },
  });

  assert.ok(readAll.items.every((notification) => notification.read));
  assert.equal(readAll.unreadCount, 0);
});

test("external action URLs are rejected by the client schema", () => {
  assert.throws(() =>
    inAppNotificationSchema.parse({ ...item, actionUrl: "https://example.com" }),
  );
  assert.throws(() =>
    inAppNotificationSchema.parse({ ...item, actionUrl: "//evil.example" }),
  );
  assert.throws(() =>
    inAppNotificationSchema.parse({ ...item, actionUrl: "/%2Fevil" }),
  );
});
