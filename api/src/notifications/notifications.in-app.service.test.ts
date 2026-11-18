import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotificationsService } from "./notifications.service";

type Row = {
  id: string;
  userId: string;
  notificationType: string | null;
  title: string;
  message: string;
  actionUrl: string | null;
  dedupeKey: string;
  createdAt: Date;
  readAt: Date | null;
  dismissedAt: Date | null;
};

function createHarness(options: { optedOut?: boolean } = {}) {
  const rows: Row[] = [];
  const lockCalls: string[] = [];
  const publisher = {
    events: [] as Array<{ userId: string; event: Record<string, unknown> }>,
    async enqueue(
      _manager: unknown,
      userId: string,
      event: Record<string, unknown>,
    ) {
      publisher.events.push({ userId, event });
    },
  };
  const preferenceRows = options.optedOut
    ? [
        {
          userId: "user-1",
          notificationType: "badge_earned",
          channel: "in_app",
          optedOut: true,
        },
      ]
    : [];

  const preferenceRepository = {
    find: async () => preferenceRows,
  };

  const repository = {
    find: async (options: Record<string, unknown>) => {
      const where = options.where as {
        userId?: string;
        dismissedAt?: unknown;
      };
      let result = rows.filter((row) => row.userId === where.userId);
      if (where.dismissedAt !== undefined) {
        result = result.filter((row) => row.dismissedAt === null);
      }
      result.sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      );
      const take = options.take as number | undefined;
      return take === undefined ? result : result.slice(0, take);
    },
    count: async (options: Record<string, unknown>) => {
      const where = options.where as {
        userId?: string;
        dismissedAt?: unknown;
        readAt?: unknown;
      };
      return rows.filter(
        (row) =>
          row.userId === where.userId &&
          where.dismissedAt !== undefined
            ? row.dismissedAt === null &&
              (where.readAt === undefined ? true : row.readAt === null)
            : true,
      ).length;
    },
    findOne: async (options: Record<string, unknown>) => {
      const where = options.where as {
        id?: string;
        userId?: string;
        dismissedAt?: unknown;
      };
      return rows.find(
        (row) =>
          row.id === where.id &&
          row.userId === where.userId &&
          (where.dismissedAt === undefined || row.dismissedAt === null),
      ) ?? null;
    },
    update: async (
      criteria: { id: string; userId: string },
      values: Partial<Row>,
    ) => {
      const row = rows.find(
        (candidate) =>
          candidate.id === criteria.id && candidate.userId === criteria.userId,
      );
      if (row) Object.assign(row, values);
    },
    createQueryBuilder: () => {
      const state = {
        userId: null as string | null,
        afterCreatedAt: null as Date | null,
        afterId: null as string | null,
        take: undefined as number | undefined,
      };
      const builder = {
        where: (_clause: string, parameters: { userId: string }) => {
          state.userId = parameters.userId;
          return builder;
        },
        andWhere: (
          clause: string,
          parameters?:
            | { cursorCreatedAt: Date | string; cursorId: string }
            | undefined,
        ) => {
          if (clause.includes("createdAt") && parameters) {
            state.afterCreatedAt = new Date(parameters?.cursorCreatedAt ?? 0);
            state.afterId = parameters?.cursorId ?? null;
          }

          return builder;
        },
        orderBy: () => builder,
        addOrderBy: () => builder,
        take: (value: number) => {
          state.take = value;
          return builder;
        },
        getMany: async () => {
          const filtered = rows
            .filter((row) => row.userId === state.userId)
            .filter((row) => row.dismissedAt === null && row.readAt === null)
            .filter((row) => {
              if (state.afterCreatedAt === null || state.afterId === null) {
                return true;
              }

              return (
                row.createdAt.getTime() > state.afterCreatedAt.getTime() ||
                (row.createdAt.getTime() === state.afterCreatedAt.getTime() &&
                  BigInt(row.id) > BigInt(state.afterId))
              );
            })
            .sort(
              (left, right) => {
                const createdAtOrder =
                  left.createdAt.getTime() - right.createdAt.getTime();
                if (createdAtOrder !== 0) {
                  return createdAtOrder;
                }

                if (BigInt(left.id) > BigInt(right.id)) {
                  return 1;
                }

                if (BigInt(left.id) < BigInt(right.id)) {
                  return -1;
                }

                return 0;
              },
            );

          return state.take === undefined
            ? filtered
            : filtered.slice(0, state.take);
        },
      };

      return builder;
    },
  };

  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        lockCalls.push(String(parameters[0]));
        return [];
      }

      if (sql.includes("INSERT INTO \"in_app_notification\"")) {
        const [userId, notificationType, title, message, actionUrl, dedupeKey] =
          parameters as [string, string | null, string, string, string | null, string];
        if (rows.some((row) => row.userId === userId && row.dedupeKey === dedupeKey)) {
          return [];
        }
        const row: Row = {
          id: String(rows.length + 1),
          userId,
          notificationType,
          title,
          message,
          actionUrl,
          dedupeKey,
          createdAt: new Date(Date.now() + rows.length),
          readAt: null,
          dismissedAt: null,
        };
        rows.push(row);
        return [row];
      }

      return [];
    },
    find: async () => preferenceRows,
    getRepository: () => repository,
  };

  const dataSource = {
    transaction: async (work: (manager: unknown) => Promise<unknown>) =>
      work(manager),
  };

  const service = new (NotificationsService as unknown as new (...args: unknown[]) => NotificationsService)(
    preferenceRepository,
    repository,
    dataSource,
    publisher,
  );

  return { lockCalls, manager, publisher, rows, service };
}

const input = {
  userId: "user-1",
  notificationType: "badge_earned" as const,
  title: "Badge earned",
  message: "You unlocked First Post.",
  actionUrl: "/achievements",
  dedupeKey: "engine:rule-1:event-1",
};

test("createInAppNotification skips a typed item when in-app is opted out", async () => {
  const harness = createHarness({ optedOut: true });

  const result = await harness.service.createInAppNotification(
    harness.manager as never,
    input,
  );

  assert.equal(result, null);
  assert.equal(harness.rows.length, 0);
  assert.equal(harness.publisher.events.length, 0);
});

test("createInAppNotification returns null on a dedupe conflict before recounting or publishing", async () => {
  const harness = createHarness();

  const first = await harness.service.createInAppNotification(harness.manager as never, input);
  const eventCountAfterFirst = harness.publisher.events.length;
  const replay = await harness.service.createInAppNotification(harness.manager as never, input);

  assert.equal(first?.id, "1");
  assert.equal(replay, null);
  assert.equal(harness.rows.length, 1);
  assert.equal(harness.publisher.events.length, eventCountAfterFirst);
  assert.deepEqual(harness.lockCalls, ["user-1", "user-1"]);
});

test("list preserves the authoritative unread total beyond the visible page", async () => {
  const harness = createHarness();
  for (let index = 0; index < 75; index += 1) {
    harness.rows.push({
      id: String(index + 1),
      userId: "user-1",
      notificationType: "badge_earned",
      title: `Badge ${index}`,
      message: "Description",
      actionUrl: null,
      dedupeKey: `seed:${index}`,
      createdAt: new Date(2026, 0, index + 1),
      readAt: null,
      dismissedAt: null,
    });
  }

  const result = await harness.service.listInAppNotifications("user-1", 50);

  assert.equal(result.notifications.length, 50);
  assert.equal(result.unreadCount, 75);
});

test("mutations serialize per-user and reject cross-user rows", async () => {
  const harness = createHarness();
  harness.rows.push({
    id: "n1",
    userId: "user-1",
    notificationType: "badge_earned",
    title: "Badge",
    message: "Description",
    actionUrl: null,
    dedupeKey: "seed:n1",
    createdAt: new Date(),
    readAt: null,
    dismissedAt: null,
  });

  const read = await harness.service.markInAppNotificationRead("user-1", "n1");
  assert.equal(read.notification.read, true);
  assert.ok(harness.lockCalls.includes("user-1"));
  assert.equal(
    harness.publisher.events[harness.publisher.events.length - 1]?.event.type,
    "notification.updated",
  );

  await assert.rejects(
    () => harness.service.markInAppNotificationRead("another-user", "n1"),
    /not found/i,
  );
});

test("pending list drains every unread non-dismissed row oldest first exactly once", async () => {
  const harness = createHarness();
  harness.rows.push(
    {
      id: "101",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Oldest",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:101",
      createdAt: new Date("2026-08-10T10:00:00.000Z"),
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "102",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Tie A",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:102",
      createdAt: new Date("2026-08-10T10:01:00.000Z"),
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "103",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Tie B",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:103",
      createdAt: new Date("2026-08-10T10:01:00.000Z"),
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "104",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Newest unread",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:104",
      createdAt: new Date("2026-08-10T10:02:00.000Z"),
      readAt: null,
      dismissedAt: null,
    },
    {
      id: "105",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Already read",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:105",
      createdAt: new Date("2026-08-10T10:03:00.000Z"),
      readAt: new Date("2026-08-10T10:04:00.000Z"),
      dismissedAt: null,
    },
    {
      id: "106",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Dismissed",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:106",
      createdAt: new Date("2026-08-10T10:05:00.000Z"),
      readAt: null,
      dismissedAt: new Date("2026-08-10T10:06:00.000Z"),
    },
    {
      id: "201",
      userId: "another-user",
      notificationType: "badge_earned",
      title: "Other user",
      message: "Description",
      actionUrl: null,
      dedupeKey: "seed:201",
      createdAt: new Date("2026-08-10T09:59:00.000Z"),
      readAt: null,
      dismissedAt: null,
    },
  );

  const firstPage = await harness.service.listPendingInAppNotifications(
    "user-1",
    2,
  );
  const secondPage = await harness.service.listPendingInAppNotifications(
    "user-1",
    2,
    firstPage.nextCursor,
  );
  const thirdPage = await harness.service.listPendingInAppNotifications(
    "user-1",
    2,
    secondPage.nextCursor,
  );

  assert.deepEqual(firstPage.notifications.map((item) => item.id), [
    "101",
    "102",
  ]);
  assert.equal(typeof firstPage.nextCursor, "string");
  assert.deepEqual(secondPage.notifications.map((item) => item.id), [
    "103",
    "104",
  ]);
  assert.equal(secondPage.nextCursor, null);
  assert.deepEqual(thirdPage.notifications, []);
  assert.equal(thirdPage.nextCursor, null);
  assert.deepEqual(
    [...firstPage.notifications, ...secondPage.notifications].map(
      (item) => item.id,
    ),
    ["101", "102", "103", "104"],
  );
});

test("pending pagination follows nextCursor across 51 plus eligible rows without duplicating ids", async () => {
  const harness = createHarness();

  for (let index = 0; index < 53; index += 1) {
    harness.rows.push({
      id: String(1000 + index),
      userId: "user-1",
      notificationType: "badge_earned",
      title: `Eligible ${index}`,
      message: "Description",
      actionUrl: null,
      dedupeKey: `eligible:${index}`,
      createdAt: new Date(Date.UTC(2026, 7, 10, 10, 0, index)),
      readAt: null,
      dismissedAt: null,
    });
  }

  harness.rows.push(
    {
      id: "3000",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Read",
      message: "Description",
      actionUrl: null,
      dedupeKey: "read",
      createdAt: new Date(Date.UTC(2026, 7, 10, 11, 0, 0)),
      readAt: new Date(Date.UTC(2026, 7, 10, 11, 1, 0)),
      dismissedAt: null,
    },
    {
      id: "3001",
      userId: "user-1",
      notificationType: "badge_earned",
      title: "Dismissed",
      message: "Description",
      actionUrl: null,
      dedupeKey: "dismissed",
      createdAt: new Date(Date.UTC(2026, 7, 10, 11, 2, 0)),
      readAt: null,
      dismissedAt: new Date(Date.UTC(2026, 7, 10, 11, 3, 0)),
    },
    {
      id: "4000",
      userId: "another-user",
      notificationType: "badge_earned",
      title: "Other user",
      message: "Description",
      actionUrl: null,
      dedupeKey: "other-user",
      createdAt: new Date(Date.UTC(2026, 7, 10, 9, 59, 0)),
      readAt: null,
      dismissedAt: null,
    },
  );

  const seenIds: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await harness.service.listPendingInAppNotifications(
      "user-1",
      50,
      cursor,
    );
    seenIds.push(...page.notifications.map((item) => item.id));

    if (page.nextCursor === null) {
      break;
    }

    cursor = page.nextCursor;
  }

  assert.equal(seenIds.length, 53);
  assert.equal(new Set(seenIds).size, 53);
  assert.deepEqual(seenIds, Array.from({ length: 53 }, (_, index) => String(1000 + index)));
});
