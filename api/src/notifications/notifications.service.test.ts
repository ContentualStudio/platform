import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  NotificationsService,
  NotificationPreferenceError,
} from "./notifications.service";
import type { NotificationPreferenceEntity } from "./entities/notification-preference.entity";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

function createHarness(
  initialRows: Partial<NotificationPreferenceEntity>[] = [],
) {
  const rows = initialRows.map((row) => ({
    userId: row.userId ?? user.id,
    notificationType: row.notificationType ?? "daily_task_notice",
    channel: row.channel ?? "in_app",
    optedOut: row.optedOut ?? false,
  })) as NotificationPreferenceEntity[];
  const findCalls: Record<string, unknown>[] = [];
  const upsertCalls: unknown[] = [];

  const repository = {
    find: async (options: Record<string, unknown>) => {
      findCalls.push(options);
      const where = options.where as { userId?: string } | undefined;
      return rows.filter((row) => row.userId === where?.userId);
    },
    upsert: async (
      values: Partial<NotificationPreferenceEntity>,
      conflictPaths: string[],
    ) => {
      upsertCalls.push({ values, conflictPaths });
      const existingIndex = rows.findIndex(
        (row) =>
          row.userId === values.userId &&
          row.notificationType === values.notificationType &&
          row.channel === values.channel,
      );

      if (existingIndex === -1) {
        rows.push(values as NotificationPreferenceEntity);
      } else {
        rows[existingIndex] = {
          ...rows[existingIndex],
          ...values,
        };
      }
    },
  };

  return {
    findCalls,
    rows,
    service: new NotificationsService(repository as never),
    upsertCalls,
  };
}

test("getPreferences returns registry defaults and scopes reads to the user", async () => {
  const harness = createHarness([
    {
      userId: user.id,
      notificationType: "daily_task_notice",
      channel: "email",
      optedOut: true,
    },
    {
      userId: "another-user",
      notificationType: "daily_task_notice",
      channel: "in_app",
      optedOut: true,
    },
  ]);

  const result = await harness.service.getPreferences(user);

  assert.deepEqual(harness.findCalls, [{ where: { userId: user.id } }]);
  assert.equal(
    result.preferences
      .find((preference) => preference.type === "daily_task_notice")
      ?.channels.find((channel) => channel.channel === "email")?.optedOut,
    true,
  );
  assert.equal(
    result.preferences
      .find((preference) => preference.type === "daily_task_notice")
      ?.channels.find((channel) => channel.channel === "in_app")?.optedOut,
    false,
  );
  assert.equal(
    result.preferences
      .find((preference) => preference.type === "milestone_reached")
      ?.channels.every((channel) => channel.optedOut === false),
    true,
  );
});

test("setPreference persists one user-scoped channel and returns fresh values", async () => {
  const harness = createHarness();

  const result = await harness.service.setPreference(user, {
    notificationType: "badge_earned",
    channel: "in_app",
    optedOut: true,
  });

  assert.deepEqual(harness.upsertCalls, [
    {
      values: {
        userId: user.id,
        notificationType: "badge_earned",
        channel: "in_app",
        optedOut: true,
      },
      conflictPaths: ["userId", "notificationType", "channel"],
    },
  ]);
  assert.equal(
    result.preferences
      .find((preference) => preference.type === "badge_earned")
      ?.channels[0]?.optedOut,
    true,
  );
});

test("isDeliveryAllowed blocks opted-out product notifications and allows defaults", async () => {
  const harness = createHarness([
    {
      userId: user.id,
      notificationType: "streak_at_risk",
      channel: "email",
      optedOut: true,
    },
  ]);

  assert.equal(
    await harness.service.isDeliveryAllowed(
      user,
      "streak_at_risk",
      "email",
    ),
    false,
  );
  assert.equal(
    await harness.service.isDeliveryAllowed(
      user,
      "streak_at_risk",
      "in_app",
    ),
    true,
  );
});

test("account-critical email is always allowed outside the notification registry", async () => {
  const harness = createHarness([
    {
      userId: user.id,
      notificationType: "daily_task_notice",
      channel: "email",
      optedOut: true,
    },
  ]);

  assert.equal(
    await harness.service.isDeliveryAllowed(user, "login_code", "email"),
    true,
  );
});

test("setPreference rejects channels that are not configured for a type", async () => {
  const harness = createHarness();

  await assert.rejects(
    () =>
      harness.service.setPreference(user, {
        notificationType: "badge_earned",
        channel: "email",
        optedOut: true,
      }),
    (error: unknown) =>
      error instanceof NotificationPreferenceError &&
      error.message === "Email is not available for badge earned notifications.",
  );
  assert.deepEqual(harness.upsertCalls, []);
});
