import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import databaseConfig from "../config/database.config";
import appDataSource from "../database/data-source";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { InAppNotificationEntity } from "./entities/in-app-notification.entity";
import { NotificationPreferenceEntity } from "./entities/notification-preference.entity";
import { NotificationsService } from "./notifications.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";
const USER_ID = "notifications-concurrency-user";

let dataSource: DataSource;

before(async () => {
  if (skip) return;

  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);
  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, USER_ID, `${USER_ID}@example.test`],
  );
});

beforeEach(async () => {
  if (skip) return;
  await dataSource.query(
    `DELETE FROM "in_app_notification" WHERE "userId" = $1`,
    [USER_ID],
  );
  await dataSource.query(
    `DELETE FROM "notification_preference" WHERE "userId" = $1`,
    [USER_ID],
  );
});

after(async () => {
  if (!skip && dataSource?.isInitialized) {
    await dataSource.destroy();
  }
});

test("concurrent creates publish serialized authoritative unread totals", { skip }, async () => {
  const published: number[] = [];
  const publisher = {
    async enqueue(
      _manager: unknown,
      _userId: string,
      event: { type: string; unreadCount?: number },
    ) {
      if (event.type === "notification.created") {
        published.push(event.unreadCount ?? -1);
      }
    },
  };
  const service = new NotificationsService(
    dataSource.getRepository(NotificationPreferenceEntity),
    dataSource.getRepository(InAppNotificationEntity),
    dataSource,
    publisher as never,
  );

  await Promise.all(
    ["event-a", "event-b"].map((eventId) =>
      dataSource.transaction((manager) =>
        service.createInAppNotification(manager, {
          userId: USER_ID,
          notificationType: "badge_earned",
          title: "Badge earned",
          message: eventId,
          dedupeKey: `engine:rule:${eventId}`,
          sourceRuleId: "rule-concurrent",
          sourceEventId: eventId,
        }),
      ),
    ),
  );

  const [row] = (await dataSource.query(
    `SELECT COUNT(*)::int AS "count"
       FROM "in_app_notification"
      WHERE "userId" = $1`,
    [USER_ID],
  )) as Array<{ count: number }>;

  assert.equal(Number(row.count), 2);
  assert.deepEqual([...published].sort((left, right) => left - right), [1, 2]);
});
