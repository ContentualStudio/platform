import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialInAppNotificationQueueState,
  markInAppNotificationShown,
} from "../lib/in-app-notification-queue";
import type { InAppNotification } from "../schemas/notifications.schema";
import * as hookModule from "./use-in-app-notifications";

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
const readNotification: InAppNotification = {
  ...newest,
  id: "read-item",
  title: "Read item",
  read: true,
};

test("hydrateInAppNotificationPresentation enqueues only unread rows oldest first", () => {
  const hydrateInAppNotificationPresentation = (
    hookModule as unknown as {
      hydrateInAppNotificationPresentation?: typeof hookModule.useInAppNotifications;
    }
  ).hydrateInAppNotificationPresentation as
    | ((
        state: typeof initialInAppNotificationQueueState,
        response: {
          readonly notifications: readonly InAppNotification[];
          readonly unreadCount: number;
        },
      ) => typeof initialInAppNotificationQueueState)
    | undefined;

  assert.equal(
    typeof hydrateInAppNotificationPresentation,
    "function",
    "hydrateInAppNotificationPresentation should be exposed for focused presentation tests",
  );
  if (typeof hydrateInAppNotificationPresentation !== "function") {
    throw new Error("hydrateInAppNotificationPresentation should be exposed");
  }

  const state = hydrateInAppNotificationPresentation(
    initialInAppNotificationQueueState,
    {
      notifications: [newest, readNotification, oldest],
      unreadCount: 2,
    },
  );

  assert.equal(state.active?.id, "oldest");
  assert.deepEqual(state.queued.map((item) => item.id), ["newest"]);
});

test("hydrateInAppNotificationPresentation replaces stale presentation rows on authoritative reconnect hydrate", () => {
  const hydrateInAppNotificationPresentation = (
    hookModule as unknown as {
      hydrateInAppNotificationPresentation?: typeof hookModule.useInAppNotifications;
    }
  ).hydrateInAppNotificationPresentation as
    | ((
        state: typeof initialInAppNotificationQueueState,
        response: {
          readonly notifications: readonly InAppNotification[];
          readonly unreadCount: number;
        },
      ) => typeof initialInAppNotificationQueueState)
    | undefined;

  assert.equal(
    typeof hydrateInAppNotificationPresentation,
    "function",
    "hydrateInAppNotificationPresentation should be exposed for focused presentation tests",
  );
  if (typeof hydrateInAppNotificationPresentation !== "function") {
    throw new Error("hydrateInAppNotificationPresentation should be exposed");
  }

  const staleActive = { ...oldest, id: "stale-active" };
  const staleQueued = { ...newest, id: "stale-queued" };
  const authoritativeOldest = {
    ...oldest,
    id: "authoritative-oldest",
    createdAt: "2026-08-10T10:03:00.000Z",
  };
  const authoritativeNewest = {
    ...newest,
    id: "authoritative-newest",
    createdAt: "2026-08-10T10:04:00.000Z",
  };

  const state = hydrateInAppNotificationPresentation(
    {
      active: staleActive,
      queued: [staleQueued],
      shownIds: ["already-shown"],
    },
    {
      notifications: [authoritativeNewest, authoritativeOldest],
      unreadCount: 2,
    },
  );

  assert.equal(state.active?.id, "authoritative-oldest");
  assert.deepEqual(state.queued.map((item) => item.id), [
    "authoritative-newest",
  ]);
  assert.deepEqual(state.shownIds, ["already-shown"]);
});

test("hydrateInAppNotificationPresentation includes older pending rows outside the bounded inbox snapshot", () => {
  const hydrateInAppNotificationPresentation = (
    hookModule as unknown as {
      hydrateInAppNotificationPresentation?: typeof hookModule.useInAppNotifications;
    }
  ).hydrateInAppNotificationPresentation as
    | ((
        state: typeof initialInAppNotificationQueueState,
        response: {
          readonly notifications: readonly InAppNotification[];
          readonly unreadCount: number;
        },
        pendingNotifications?: readonly InAppNotification[],
      ) => typeof initialInAppNotificationQueueState)
    | undefined;

  assert.equal(
    typeof hydrateInAppNotificationPresentation,
    "function",
    "hydrateInAppNotificationPresentation should be exposed for focused presentation tests",
  );
  if (typeof hydrateInAppNotificationPresentation !== "function") {
    throw new Error("hydrateInAppNotificationPresentation should be exposed");
  }

  const state = hydrateInAppNotificationPresentation(
    initialInAppNotificationQueueState,
    {
      notifications: [newest],
      unreadCount: 1,
    },
    [{ ...oldest, id: "pending-oldest" }],
  );

  assert.equal(state.active?.id, "pending-oldest");
  assert.deepEqual(state.queued.map((item) => item.id), ["newest"]);
});

test("applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules", () => {
  const applyInAppNotificationPresentationEvent = (
    hookModule as unknown as {
      applyInAppNotificationPresentationEvent?: typeof hookModule.useInAppNotifications;
    }
  ).applyInAppNotificationPresentationEvent as
    | ((
        state: typeof initialInAppNotificationQueueState,
        event:
          | {
              readonly type: "notification.created";
              readonly notification: InAppNotification;
              readonly unreadCount: number;
            }
          | {
              readonly type: "notifications.read_all";
              readonly unreadCount: 0;
            },
      ) => typeof initialInAppNotificationQueueState)
    | undefined;

  assert.equal(
    typeof applyInAppNotificationPresentationEvent,
    "function",
    "applyInAppNotificationPresentationEvent should be exposed for focused presentation tests",
  );
  if (typeof applyInAppNotificationPresentationEvent !== "function") {
    throw new Error("applyInAppNotificationPresentationEvent should be exposed");
  }

  const shown = markInAppNotificationShown(
    {
      active: oldest,
      queued: [newest],
      shownIds: [],
    },
    "oldest",
  );

  const afterCreate = applyInAppNotificationPresentationEvent(shown, {
    type: "notification.created",
    notification: { ...newest, id: "created-during-gap" },
    unreadCount: 2,
  });
  const afterReadAll = applyInAppNotificationPresentationEvent(afterCreate, {
    type: "notifications.read_all",
    unreadCount: 0,
  });

  assert.equal(afterCreate.active?.id, "oldest");
  assert.deepEqual(afterCreate.queued.map((item) => item.id), [
    "newest",
    "created-during-gap",
  ]);
  assert.equal(afterReadAll.active?.id, "oldest");
  assert.deepEqual(afterReadAll.queued, []);
});

test("a notification read in another tab is updated when active and removed when queued", () => {
  const applyInAppNotificationPresentationEvent = (
    hookModule as unknown as {
      applyInAppNotificationPresentationEvent?: typeof hookModule.useInAppNotifications;
    }
  ).applyInAppNotificationPresentationEvent as
    | ((
        state: typeof initialInAppNotificationQueueState,
        event: {
          readonly type: "notification.updated";
          readonly notification: InAppNotification;
          readonly unreadCount: number;
        },
      ) => typeof initialInAppNotificationQueueState)
    | undefined;

  assert.equal(typeof applyInAppNotificationPresentationEvent, "function");
  if (typeof applyInAppNotificationPresentationEvent !== "function") {
    throw new Error("applyInAppNotificationPresentationEvent should be exposed");
  }

  const state = {
    active: oldest,
    queued: [newest],
    shownIds: [oldest.id],
  };
  const updatedActive = applyInAppNotificationPresentationEvent(state, {
    type: "notification.updated",
    notification: { ...oldest, read: true },
    unreadCount: 1,
  });
  const updatedQueued = applyInAppNotificationPresentationEvent(updatedActive, {
    type: "notification.updated",
    notification: { ...newest, read: true },
    unreadCount: 0,
  });

  assert.equal(updatedActive.active?.read, true);
  assert.deepEqual(updatedQueued.queued, []);
});

test("recovery completion is rejected when the realtime stream closed in flight", () => {
  const canCommitInAppNotificationRecovery = (
    hookModule as unknown as {
      canCommitInAppNotificationRecovery?: typeof hookModule.useInAppNotifications;
    }
  ).canCommitInAppNotificationRecovery as
    | ((input: { readonly streamIsOpen: boolean }) => boolean)
    | undefined;

  assert.equal(
    typeof canCommitInAppNotificationRecovery,
    "function",
    "canCommitInAppNotificationRecovery should be exposed for the disconnect race",
  );
  if (typeof canCommitInAppNotificationRecovery !== "function") {
    throw new Error("canCommitInAppNotificationRecovery should be exposed");
  }

  assert.equal(canCommitInAppNotificationRecovery({ streamIsOpen: true }), true);
  assert.equal(canCommitInAppNotificationRecovery({ streamIsOpen: false }), false);
});

test("drainPendingInAppNotifications follows nextCursor to null and rejects repeated cursors", async () => {
  const drainPendingInAppNotifications = (
    hookModule as unknown as {
      drainPendingInAppNotifications?: typeof hookModule.useInAppNotifications;
    }
  ).drainPendingInAppNotifications as
    | ((
        fetchPage: (cursor?: string) => Promise<{
          readonly notifications: readonly InAppNotification[];
          readonly nextCursor: string | null;
        }>,
      ) => Promise<readonly InAppNotification[]>)
    | undefined;

  assert.equal(
    typeof drainPendingInAppNotifications,
    "function",
    "drainPendingInAppNotifications should be exposed for focused recovery tests",
  );
  if (typeof drainPendingInAppNotifications !== "function") {
    throw new Error("drainPendingInAppNotifications should be exposed");
  }

  const calls: Array<string | undefined> = [];
  const drained = await drainPendingInAppNotifications(async (cursor) => {
    calls.push(cursor);
    if (cursor === undefined) {
      return {
        notifications: [oldest],
        nextCursor: "cursor-1",
      };
    }

    return {
      notifications: [newest],
      nextCursor: null,
    };
  });

  assert.deepEqual(calls, [undefined, "cursor-1"]);
  assert.deepEqual(drained.map((item) => item.id), ["oldest", "newest"]);

  await assert.rejects(
    () =>
      drainPendingInAppNotifications(async () => ({
        notifications: [],
        nextCursor: "cursor-repeat",
      })),
    /cursor/i,
  );
});

test("reconcileInAppNotificationRecovery drains 51 plus pending rows and replays buffered events only after the final page", async () => {
  const reconcileInAppNotificationRecovery = (
    hookModule as unknown as {
      reconcileInAppNotificationRecovery?: typeof hookModule.useInAppNotifications;
    }
  ).reconcileInAppNotificationRecovery as
    | ((
        input: {
          readonly bufferedEvents: readonly {
            readonly type: "notification.created";
            readonly notification: InAppNotification;
            readonly unreadCount: number;
          }[];
          fetchSnapshot: () => Promise<{
            readonly notifications: readonly InAppNotification[];
            readonly unreadCount: number;
          }>;
          fetchPendingPage: (cursor?: string) => Promise<{
            readonly notifications: readonly InAppNotification[];
            readonly nextCursor: string | null;
          }>;
        },
      ) => Promise<{
        readonly response: {
          readonly notifications: readonly InAppNotification[];
          readonly unreadCount: number;
        };
        readonly pendingNotifications: readonly InAppNotification[];
        readonly replayEvents: readonly {
          readonly type: "notification.created";
          readonly notification: InAppNotification;
          readonly unreadCount: number;
        }[];
      }>)
    | undefined;

  assert.equal(
    typeof reconcileInAppNotificationRecovery,
    "function",
    "reconcileInAppNotificationRecovery should be exposed for focused recovery tests",
  );
  if (typeof reconcileInAppNotificationRecovery !== "function") {
    throw new Error("reconcileInAppNotificationRecovery should be exposed");
  }

  const bufferedEvent = {
    type: "notification.created" as const,
    notification: { ...newest, id: "buffered-created", createdAt: "2026-08-10T11:30:00.000Z" },
    unreadCount: 54,
  };
  const snapshotNotification = {
    ...newest,
    id: "snapshot-newest",
    createdAt: "2026-08-10T12:00:00.000Z",
  };
  const pendingRows = Array.from({ length: 53 }, (_, index) => ({
    ...oldest,
    id: `pending-${index}`,
    title: `Pending ${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 10, 10, 0, index))
      .toISOString(),
  }));
  const pageCalls: Array<string | undefined> = [];

  const result = await reconcileInAppNotificationRecovery({
    bufferedEvents: [bufferedEvent],
    fetchSnapshot: async () => ({
      notifications: [snapshotNotification],
      unreadCount: 54,
    }),
    fetchPendingPage: async (cursor) => {
      pageCalls.push(cursor);
      if (cursor === undefined) {
        return {
          notifications: pendingRows.slice(0, 20),
          nextCursor: "cursor-1",
        };
      }
      if (cursor === "cursor-1") {
        return {
          notifications: pendingRows.slice(20, 40),
          nextCursor: "cursor-2",
        };
      }

      return {
        notifications: pendingRows.slice(40),
        nextCursor: null,
      };
    },
  });

  assert.deepEqual(pageCalls, [undefined, "cursor-1", "cursor-2"]);
  assert.equal(result.pendingNotifications.length, 53);
  assert.deepEqual(
    result.pendingNotifications.map((item) => item.id),
    pendingRows.map((item) => item.id),
  );
  assert.deepEqual(result.replayEvents, [bufferedEvent]);
  assert.deepEqual(result.response.notifications, [snapshotNotification]);
});

test("reconcileInAppNotificationRecovery leaves presentation inputs and buffered events intact when a pending page fails until a retry succeeds", async () => {
  const reconcileInAppNotificationRecovery = (
    hookModule as unknown as {
      reconcileInAppNotificationRecovery?: typeof hookModule.useInAppNotifications;
    }
  ).reconcileInAppNotificationRecovery as
    | ((
        input: {
          readonly bufferedEvents: readonly {
            readonly type: "notification.created";
            readonly notification: InAppNotification;
            readonly unreadCount: number;
          }[];
          fetchSnapshot: () => Promise<{
            readonly notifications: readonly InAppNotification[];
            readonly unreadCount: number;
          }>;
          fetchPendingPage: (cursor?: string) => Promise<{
            readonly notifications: readonly InAppNotification[];
            readonly nextCursor: string | null;
          }>;
        },
      ) => Promise<{
        readonly pendingNotifications: readonly InAppNotification[];
        readonly replayEvents: readonly {
          readonly type: "notification.created";
          readonly notification: InAppNotification;
          readonly unreadCount: number;
        }[];
      }>)
    | undefined;
  const hydrateInAppNotificationPresentation = (
    hookModule as unknown as {
      hydrateInAppNotificationPresentation?: typeof hookModule.useInAppNotifications;
    }
  ).hydrateInAppNotificationPresentation as
    | ((
        state: typeof initialInAppNotificationQueueState,
        response: {
          readonly notifications: readonly InAppNotification[];
          readonly unreadCount: number;
        },
        pendingNotifications?: readonly InAppNotification[],
      ) => typeof initialInAppNotificationQueueState)
    | undefined;
  const createInAppNotificationRetryScheduler = (
    hookModule as unknown as {
      createInAppNotificationRetryScheduler?: typeof hookModule.useInAppNotifications;
    }
  ).createInAppNotificationRetryScheduler as
    | ((input?: {
        delayMs?: number;
        scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
        clearScheduledTimeout?: (handle: unknown) => void;
      }) => {
        schedule: (callback: () => void) => void;
        clear: () => void;
        dispose: () => void;
        hasScheduledRetry: () => boolean;
      })
    | undefined;

  assert.equal(typeof reconcileInAppNotificationRecovery, "function");
  assert.equal(typeof hydrateInAppNotificationPresentation, "function");
  assert.equal(typeof createInAppNotificationRetryScheduler, "function");
  if (
    typeof reconcileInAppNotificationRecovery !== "function" ||
    typeof hydrateInAppNotificationPresentation !== "function" ||
    typeof createInAppNotificationRetryScheduler !== "function"
  ) {
    throw new Error("Recovery helpers should be exposed");
  }

  const originalPresentation = {
    active: oldest,
    queued: [newest],
    shownIds: ["oldest"],
  };
  const bufferedEvent = {
    type: "notification.created" as const,
    notification: { ...newest, id: "buffered-created" },
    unreadCount: 3,
  };
  const bufferedEvents = [bufferedEvent];
  const timers: Array<() => void> = [];
  const cleared: unknown[] = [];
  const retryScheduler = createInAppNotificationRetryScheduler({
    delayMs: 25,
    scheduleTimeout: (callback) => {
      timers.push(callback);
      return callback;
    },
    clearScheduledTimeout: (handle) => {
      cleared.push(handle);
    },
  });

  await assert.rejects(
    () =>
      reconcileInAppNotificationRecovery({
        bufferedEvents,
        fetchSnapshot: async () => ({
          notifications: [newest],
          unreadCount: 2,
        }),
        fetchPendingPage: async (cursor) => {
          if (cursor === undefined) {
            return {
              notifications: [{ ...oldest, id: "pending-oldest" }],
              nextCursor: "cursor-1",
            };
          }

          throw new Error("page failed");
        },
      }),
    /page failed/,
  );

  assert.deepEqual(originalPresentation, {
    active: oldest,
    queued: [newest],
    shownIds: ["oldest"],
  });
  assert.deepEqual(bufferedEvents, [bufferedEvent]);

  let retryCount = 0;
  retryScheduler.schedule(() => {
    retryCount += 1;
  });
  retryScheduler.schedule(() => {
    retryCount += 1;
  });
  assert.equal(retryScheduler.hasScheduledRetry(), true);
  assert.equal(timers.length, 1);
  timers[0]?.();
  assert.equal(retryCount, 1);
  assert.equal(retryScheduler.hasScheduledRetry(), false);

  const retried = await reconcileInAppNotificationRecovery({
    bufferedEvents,
    fetchSnapshot: async () => ({
      notifications: [newest],
      unreadCount: 2,
    }),
    fetchPendingPage: async () => ({
      notifications: [{ ...oldest, id: "pending-oldest" }],
      nextCursor: null,
    }),
  });

  const recoveredPresentation = hydrateInAppNotificationPresentation(
    originalPresentation,
    {
      notifications: [newest],
      unreadCount: 2,
    },
    retried.pendingNotifications,
  );

  assert.deepEqual(retried.replayEvents, [bufferedEvent]);
  assert.equal(recoveredPresentation.active?.id, "pending-oldest");
  assert.deepEqual(recoveredPresentation.queued.map((item) => item.id), [
    "newest",
  ]);
  retryScheduler.dispose();
  assert.equal(cleared.length, 0);
});

test("scheduleInAppNotificationRecoveryRetry only schedules while the stream remains open", () => {
  const createInAppNotificationRetryScheduler = (
    hookModule as unknown as {
      createInAppNotificationRetryScheduler?: typeof hookModule.useInAppNotifications;
      scheduleInAppNotificationRecoveryRetry?: typeof hookModule.useInAppNotifications;
    }
  ).createInAppNotificationRetryScheduler as
    | ((input?: {
        delayMs?: number;
        scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
        clearScheduledTimeout?: (handle: unknown) => void;
      }) => {
        schedule: (callback: () => void) => void;
        clear: () => void;
        dispose: () => void;
        hasScheduledRetry: () => boolean;
      })
    | undefined;
  const scheduleInAppNotificationRecoveryRetry = (
    hookModule as unknown as {
      scheduleInAppNotificationRecoveryRetry?: typeof hookModule.useInAppNotifications;
    }
  ).scheduleInAppNotificationRecoveryRetry as
    | ((input: {
        streamIsOpen: boolean;
        retryScheduler: {
          schedule: (callback: () => void) => void;
        };
        reconcile: () => void | Promise<void>;
      }) => boolean)
    | undefined;

  assert.equal(typeof createInAppNotificationRetryScheduler, "function");
  assert.equal(typeof scheduleInAppNotificationRecoveryRetry, "function");
  if (
    typeof createInAppNotificationRetryScheduler !== "function" ||
    typeof scheduleInAppNotificationRecoveryRetry !== "function"
  ) {
    throw new Error("Retry helpers should be exposed");
  }

  const queuedCallbacks: Array<() => void> = [];
  const retryScheduler = createInAppNotificationRetryScheduler({
    delayMs: 25,
    scheduleTimeout: (callback) => {
      queuedCallbacks.push(callback);
      return callback;
    },
    clearScheduledTimeout: () => undefined,
  });
  let openRetryCount = 0;
  let disconnectedRetryCount = 0;

  const openScheduled = scheduleInAppNotificationRecoveryRetry({
    streamIsOpen: true,
    retryScheduler,
    reconcile: () => {
      openRetryCount += 1;
    },
  });
  const disconnectedScheduled = scheduleInAppNotificationRecoveryRetry({
    streamIsOpen: false,
    retryScheduler,
    reconcile: () => {
      disconnectedRetryCount += 1;
    },
  });

  assert.equal(openScheduled, true);
  assert.equal(disconnectedScheduled, false);
  assert.equal(queuedCallbacks.length, 1);
  queuedCallbacks[0]?.();
  assert.equal(openRetryCount, 1);
  assert.equal(disconnectedRetryCount, 0);
});
