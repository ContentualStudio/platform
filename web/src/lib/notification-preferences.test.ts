import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { NotificationPreference } from "../schemas/notifications.schema";
import {
  notificationPreferenceKey,
  toggleNotificationPreference,
} from "./notification-preferences";

const preferences: NotificationPreference[] = [
  {
    type: "daily_task_notice",
    label: "Daily task notice",
    description: "Reminder when your daily challenge is ready",
    channels: [
      {
        channel: "in_app",
        label: "In-app",
        optedOut: false,
        defaultOptedOut: false,
      },
      {
        channel: "email",
        label: "Email",
        optedOut: true,
        defaultOptedOut: false,
      },
    ],
  },
  {
    type: "badge_earned",
    label: "Badge earned",
    description: "When you unlock a new achievement badge",
    channels: [
      {
        channel: "in_app",
        label: "In-app",
        optedOut: false,
        defaultOptedOut: false,
      },
    ],
  },
];

test("notificationPreferenceKey identifies a type and channel", () => {
  assert.equal(
    notificationPreferenceKey("daily_task_notice", "email"),
    "daily_task_notice:email",
  );
});

test("toggleNotificationPreference changes only the requested channel immutably", () => {
  const next = toggleNotificationPreference(
    preferences,
    "daily_task_notice",
    "in_app",
  );

  assert.equal(next[0]?.channels[0]?.optedOut, true);
  assert.equal(next[0]?.channels[1]?.optedOut, true);
  assert.equal(next[1]?.channels[0]?.optedOut, false);
  assert.notEqual(next, preferences);
  assert.notEqual(next[0], preferences[0]);
  assert.equal(preferences[0]?.channels[0]?.optedOut, false);
});

test("toggleNotificationPreference returns an equivalent copy when the target is absent", () => {
  const next = toggleNotificationPreference(
    preferences,
    "badge_earned",
    "email",
  );

  assert.deepEqual(next, preferences);
  assert.notEqual(next, preferences);
});
