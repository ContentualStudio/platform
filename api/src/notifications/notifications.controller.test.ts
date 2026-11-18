import * as assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { test } from "node:test";
import { Observable } from "rxjs";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { NotificationsController } from "./notifications.controller";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

test("in-app routes pass the authenticated user and return service values unchanged", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const values = {
    notifications: [],
    unreadCount: 0,
  };
  const service = {
    listInAppNotifications: async (...args: unknown[]) => {
      calls.push({ method: "list", args });
      return values;
    },
    listPendingInAppNotifications: async (...args: unknown[]) => {
      calls.push({ method: "pending", args });
      return { notifications: [], nextCursor: null };
    },
    markInAppNotificationRead: async (...args: unknown[]) => {
      calls.push({ method: "read", args });
      return { notification: { id: "n1" }, unreadCount: 0 };
    },
    markAllInAppNotificationsRead: async (...args: unknown[]) => {
      calls.push({ method: "readAll", args });
      return values;
    },
    dismissInAppNotification: async (...args: unknown[]) => {
      calls.push({ method: "dismiss", args });
      return { notificationId: "n1", unreadCount: 0 };
    },
  };
  const controller = new NotificationsController(service as never);

  assert.equal(await controller.getInAppNotifications(user, { limit: "50" }), values);
  assert.deepEqual(
    await controller.getPendingInAppNotifications(user, {
      limit: "50",
      cursor: "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTEwVDEwOjAwOjAwLjAwMFoiLCJpZCI6IjEwMSJ9",
    }),
    {
      notifications: [],
      nextCursor: null,
    },
  );
  assert.deepEqual(await controller.readInAppNotification(user, "n1"), {
    notification: { id: "n1" },
    unreadCount: 0,
  });
  assert.equal(await controller.readAllInAppNotifications(user), values);
  assert.deepEqual(await controller.dismissInAppNotification(user, "n1"), {
    notificationId: "n1",
    unreadCount: 0,
  });

  assert.deepEqual(calls, [
    { method: "list", args: [user.id, 50] },
    {
      method: "pending",
      args: [
        user.id,
        50,
        "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTEwVDEwOjAwOjAwLjAwMFoiLCJpZCI6IjEwMSJ9",
      ],
    },
    { method: "read", args: [user.id, "n1"] },
    { method: "readAll", args: [user.id] },
    { method: "dismiss", args: [user.id, "n1"] },
  ]);
});

test("preference routes pass the authenticated user and validated payload", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const values = {
    preferences: [],
  };
  const service = {
    getPreferences: async (...args: unknown[]) => {
      calls.push({ method: "getPreferences", args });
      return values;
    },
    setPreference: async (...args: unknown[]) => {
      calls.push({ method: "setPreference", args });
      return values;
    },
  };
  const controller = new NotificationsController(service as never);

  assert.equal(await controller.getPreferences(user), values);
  assert.equal(
    await controller.setPreference(user, {
      notificationType: "badge_earned",
      channel: "in_app",
      optedOut: true,
    }),
    values,
  );

  assert.deepEqual(calls, [
    { method: "getPreferences", args: [user] },
    {
      method: "setPreference",
      args: [
        user,
        {
          notificationType: "badge_earned",
          channel: "in_app",
          optedOut: true,
        },
      ],
    },
  ]);
});

test("preference routes reject a channel that is not registered for the type", async () => {
  const service = {
    setPreference: async () => {
      throw new Error("must not be called");
    },
  };
  const controller = new NotificationsController(service as never);

  await assert.rejects(
    () =>
      controller.setPreference(user, {
        notificationType: "badge_earned",
        channel: "email",
        optedOut: true,
      }),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test("in-app list rejects invalid limits before calling the service", async () => {
  const service = {
    listInAppNotifications: async () => {
      throw new Error("must not be called");
    },
  };
  const controller = new NotificationsController(service as never);

  await assert.rejects(
    () => controller.getInAppNotifications(user, { limit: "101" }),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test("pending in-app list rejects malformed cursors before calling the service", async () => {
  const service = {
    listPendingInAppNotifications: async () => {
      throw new Error("must not be called");
    },
  };
  const controller = new NotificationsController(service as never);

  await assert.rejects(
    () =>
      controller.getPendingInAppNotifications(user, {
        limit: "50",
        cursor: "not-a-valid-cursor",
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      assert.deepEqual(error.getResponse(), {
        code: "INVALID_NOTIFICATION_QUERY",
        message: "The notification query is invalid.",
      }) === undefined,
  );
});

test("SSE stream closes when the realtime bus fails instead of leaving heartbeat alive", async () => {
  const service = {};
  const streamError = new Error("listener failed");
  const bus = {
    subscribe: () =>
      new Observable((subscriber) => {
        subscriber.next({ type: "heartbeat" });
        subscriber.error(streamError);
      }),
  };
  const controller = new NotificationsController(service as never, bus as never);
  const received: unknown[] = [];
  let error: unknown;

  await new Promise<void>((resolve) => {
    controller.streamInAppNotifications(user).subscribe({
      next: (event) => received.push(event),
      error: (value) => {
        error = value;
        resolve();
      },
      complete: resolve,
    });
  });

  assert.deepEqual(received, [
    { type: "heartbeat", data: '{"type":"heartbeat"}' },
  ]);
  assert.equal(error, streamError);
});
