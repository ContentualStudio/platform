import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotificationsRealtimeBus } from "./notifications-realtime.bus";
import type { InAppNotificationView } from "./in-app-notification.types";

const notification: InAppNotificationView = {
  id: "n1",
  type: "badge_earned",
  title: "Badge earned",
  description: "You unlocked a badge.",
  actionUrl: "/achievements",
  read: false,
  createdAt: "2026-08-10T10:00:00.000Z",
};

function createBus(
  repository: { findOne: (options?: unknown) => Promise<unknown> } = {
    findOne: async () => null,
  },
) {
  const config = {
    get: (key: string) =>
      key === "database.url"
        ? "postgresql://postgres:postgres@localhost:5432/contentual"
        : key === "database.ssl"
          ? false
          : undefined,
    getOrThrow: (key: string) =>
      key === "database.url"
        ? "postgresql://postgres:postgres@localhost:5432/contentual"
        : undefined,
  };
  const dataSource = { getRepository: () => repository };
  return new NotificationsRealtimeBus(config as never, dataSource as never);
}

test("fans an event only to subscribers for the matching user", async () => {
  const bus = createBus();
  const userEvents: unknown[] = [];
  const otherEvents: unknown[] = [];

  const userSubscription = bus.subscribe("user-1").subscribe((event) => {
    userEvents.push(event);
  });
  const otherSubscription = bus.subscribe("user-2").subscribe((event) => {
    otherEvents.push(event);
  });

  (bus as unknown as { publish: (userId: string, event: unknown) => void }).publish(
    "user-1",
    { type: "notification.created", notification, unreadCount: 1 },
  );

  assert.deepEqual(userEvents, [
    { type: "notification.created", notification, unreadCount: 1 },
  ]);
  assert.deepEqual(otherEvents, []);
  userSubscription.unsubscribe();
  otherSubscription.unsubscribe();
});

test("listener failure errors subscribers and removes them", async () => {
  const bus = createBus();
  let failure: unknown;
  const subscription = bus.subscribe("user-1").subscribe({
    error: (error) => {
      failure = error;
    },
  });

  (bus as unknown as { failListener: (error: Error) => void }).failListener(
    new Error("connection lost"),
  );

  assert.equal((failure as Error).name, "NotificationsRealtimeListenerError");
  assert.equal(
    (bus as unknown as { subscriberCount: () => number }).subscriberCount(),
    0,
  );
  subscription.unsubscribe();
  await bus.onModuleDestroy();
});

test("subscriptions opened after an initial listener failure fail until recovery", async () => {
  const bus = createBus();
  let failure: unknown;

  (bus as unknown as { failListener: (error: Error) => void }).failListener(
    new Error("initial LISTEN failed"),
  );

  const subscription = bus.subscribe("user-1").subscribe({
    error: (error) => {
      failure = error;
    },
  });

  try {
    assert.equal((failure as Error).name, "NotificationsRealtimeListenerError");
    assert.equal(
      (bus as unknown as { subscriberCount: () => number }).subscriberCount(),
      0,
    );
  } finally {
    subscription.unsubscribe();
    await bus.onModuleDestroy();
  }
});

test("an unexpected listener end errors subscribers and blocks outage subscriptions", async () => {
  const bus = createBus();
  const activeClient = {
    removeAllListeners() {},
    async end() {},
  };
  let failure: unknown;
  const subscription = bus.subscribe("user-1").subscribe({
    error: (error) => {
      failure = error;
    },
  });
  (bus as unknown as { client: unknown }).client = activeClient;

  try {
    (bus as unknown as {
      handleClientEnd: (client: unknown) => void;
    }).handleClientEnd(activeClient);

    assert.equal((failure as Error).name, "NotificationsRealtimeListenerError");
    assert.equal(
      (bus as unknown as { subscriberCount: () => number }).subscriberCount(),
      0,
    );

    let lateFailure: unknown;
    const lateSubscription = bus.subscribe("user-1").subscribe({
      error: (error) => {
        lateFailure = error;
      },
    });
    try {
      assert.equal(
        (lateFailure as Error).name,
        "NotificationsRealtimeListenerError",
      );
    } finally {
      lateSubscription.unsubscribe();
    }
  } finally {
    subscription.unsubscribe();
    await bus.onModuleDestroy();
  }
});

test("an intentional listener end during shutdown does not fail subscribers", async () => {
  const bus = createBus();
  const activeClient = {
    removeAllListeners() {},
    async end() {},
  };
  let failure: unknown;
  const subscription = bus.subscribe("user-1").subscribe({
    error: (error) => {
      failure = error;
    },
  });
  (bus as unknown as { client: unknown; shuttingDown: boolean }).client =
    activeClient;
  (bus as unknown as { shuttingDown: boolean }).shuttingDown = true;

  try {
    (bus as unknown as {
      handleClientEnd: (client: unknown) => void;
    }).handleClientEnd(activeClient);

    assert.equal(failure, undefined);
    assert.equal(
      (bus as unknown as { subscriberCount: () => number }).subscriberCount(),
      1,
    );
  } finally {
    subscription.unsubscribe();
    await bus.onModuleDestroy();
  }
});

test("serial envelope processing preserves commit order when row loading is delayed", async () => {
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  const firstReleasePromise = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const repository = {
    findOne: async ({ where }: { where: { id: string } }) => {
      if (where.id === "n1") {
        firstStarted();
        await firstReleasePromise;
        return {
          ...notification,
          id: "n1",
          userId: "user-1",
          notificationType: "badge_earned",
          message: notification.description,
          createdAt: new Date(notification.createdAt),
          readAt: null,
          dismissedAt: null,
        };
      }
      return {
        ...notification,
        id: "n1",
        userId: "user-1",
        notificationType: "badge_earned",
        message: notification.description,
        createdAt: new Date(notification.createdAt),
        readAt: new Date(),
        dismissedAt: null,
      };
    },
  };
  const bus = createBus(
    repository as unknown as {
      findOne: (options?: unknown) => Promise<unknown>;
    },
  );
  const events: unknown[] = [];
  const subscription = bus.subscribe("user-1").subscribe((event) => {
    events.push(event);
  });

  const internal = bus as unknown as {
    handleEnvelope: (envelope: unknown) => void;
  };
  internal.handleEnvelope({
    userId: "user-1",
    type: "notification.created",
    notificationId: "n1",
    unreadCount: 1,
  });
  await firstStartedPromise;
  internal.handleEnvelope({
    userId: "user-1",
    type: "notification.updated",
    notificationId: "n1",
    unreadCount: 0,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, []);
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal((events[0] as { type: string }).type, "notification.created");
  assert.equal((events[1] as { type: string }).type, "notification.updated");
  assert.equal((events[1] as { unreadCount: number }).unreadCount, 0);
  subscription.unsubscribe();
});
