import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  pendingInAppNotificationsResponseSchema,
  notificationPreferenceUpdateSchema,
  notificationPreferencesResponseSchema,
} from "./notifications.schema";

const response = {
  preferences: [
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
  ],
};

test("notification preferences response preserves registry metadata and channel state", () => {
  const parsed = notificationPreferencesResponseSchema.parse(response);

  assert.equal(parsed.preferences[0]?.type, "daily_task_notice");
  assert.equal(parsed.preferences[0]?.channels[1]?.optedOut, true);
});

test("notification preference responses accept metadata added by the API registry", () => {
  const parsed = notificationPreferencesResponseSchema.parse({
    preferences: [
      {
        type: "weekly_digest",
        label: "Weekly digest",
        description: "A weekly summary of your progress.",
        channels: [
          {
            channel: "email",
            label: "Email",
            optedOut: false,
            defaultOptedOut: false,
          },
        ],
      },
    ],
  });

  assert.equal(parsed.preferences[0]?.type, "weekly_digest");
  assert.equal(parsed.preferences[0]?.channels[0]?.channel, "email");
});

test("notification preference updates validate the typed channel payload", () => {
  assert.deepEqual(
    notificationPreferenceUpdateSchema.parse({
      notificationType: "daily_task_notice",
      channel: "email",
      optedOut: true,
    }),
    {
      notificationType: "daily_task_notice",
      channel: "email",
      optedOut: true,
    },
  );
});

test("notification preference updates defer type-channel compatibility to the API registry", () => {
  assert.deepEqual(
    notificationPreferenceUpdateSchema.parse({
      notificationType: "weekly_digest",
      channel: "email",
      optedOut: true,
    }),
    {
      notificationType: "weekly_digest",
      channel: "email",
      optedOut: true,
    },
  );
});

test("pending in-app notifications response accepts opaque cursors and null termination", () => {
  const notification = {
    id: "n1",
    type: "badge_earned" as const,
    title: "Badge earned",
    description: "You unlocked a badge.",
    actionUrl: "/achievements",
    read: false,
    createdAt: "2026-08-10T10:00:00.000Z",
  };

  assert.deepEqual(
    pendingInAppNotificationsResponseSchema.parse({
      notifications: [notification],
      nextCursor: "opaque-cursor-value",
    }),
    {
      notifications: [notification],
      nextCursor: "opaque-cursor-value",
    },
  );
  assert.deepEqual(
    pendingInAppNotificationsResponseSchema.parse({
      notifications: [],
      nextCursor: null,
    }),
    {
      notifications: [],
      nextCursor: null,
    },
  );
});
