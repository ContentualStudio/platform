import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { InAppNotificationEntity } from "../notifications/entities/in-app-notification.entity";
import { NotificationPreferenceEntity } from "../notifications/entities/notification-preference.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { BadgeCooldownProcessor } from "./badge-cooldown.processor";

// The real processor against real tables. Only the realtime publisher is
// faked: it records what would have been pushed to an open session.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
const USER_A = "badge-cooldown-integration-user-a";
const USER_B = "badge-cooldown-integration-user-b";
const BADGE_ONE = "badge-cooldown-one";
const BADGE_TWO = "badge-cooldown-two";
const BADGE_THREE = "badge-cooldown-three";
const BADGE_RETIRED = "badge-cooldown-retired";

let dataSource: DataSource;
let published: { userId: string; type: string }[];

function buildProcessor(): BadgeCooldownProcessor {
  const notificationsService = new NotificationsService(
    dataSource.getRepository(NotificationPreferenceEntity),
    dataSource.getRepository(InAppNotificationEntity),
    dataSource,
    {
      async enqueue(_manager: unknown, userId: string, event: { type: string }) {
        published.push({ userId, type: event.type });
      },
    } as never,
  );

  return new BadgeCooldownProcessor(dataSource, notificationsService);
}

async function seedBadge(id: string, name: string, active = true) {
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "description", "active")
     VALUES ($1, now(), now(), $1, $2, $3, $4)`,
    [id, name, `Earned ${name}`, active],
  );
}

async function enqueue(userId: string, badgeId: string, minutesAgo: number) {
  await dataSource.query(
    `INSERT INTO "badge_cooldown_queue"
       ("userId", "badgeId", "ruleId", "eventId", "enqueuedAt")
     VALUES ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
    [userId, badgeId, `rule-${badgeId}`, `event-${userId}-${badgeId}`, minutesAgo],
  );
}

async function queue(userId: string) {
  return (await dataSource.query(
    `SELECT "badgeId", "status", "releasedAt"
       FROM "badge_cooldown_queue"
      WHERE "userId" = $1
      ORDER BY "enqueuedAt", "id"`,
    [userId],
  )) as { badgeId: string; status: string; releasedAt: Date | null }[];
}

async function notifications(userId: string) {
  return (await dataSource.query(
    `SELECT "notificationType", "title", "message", "dedupeKey"
       FROM "in_app_notification"
      WHERE "userId" = $1
      ORDER BY "createdAt", "id"`,
    [userId],
  )) as {
    notificationType: string;
    title: string;
    message: string;
    dedupeKey: string;
  }[];
}

// Stands in for "a day passes": moves this user's releases outside the window.
async function advanceDay(userId: string) {
  await dataSource.query(
    `UPDATE "badge_cooldown_queue"
        SET "releasedAt" = "releasedAt" - interval '25 hours'
      WHERE "userId" = $1 AND "releasedAt" IS NOT NULL`,
    [userId],
  );
}

function statuses(rows: { badgeId: string; status: string }[]) {
  return rows.map((row) => `${row.badgeId}:${row.status}`);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();

  for (const id of [USER_A, USER_B]) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
       ON CONFLICT ("id") DO NOTHING`,
      [id, id, `${id}@example.test`],
    );
  }
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  published = [];

  for (const table of [
    "badge_cooldown_queue",
    "in_app_notification",
    "notification_preference",
    "engine_badges",
  ]) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }

  await seedBadge(BADGE_ONE, "First Post");
  await seedBadge(BADGE_TWO, "Week Streak");
  await seedBadge(BADGE_THREE, "Hundred Club");
  await seedBadge(BADGE_RETIRED, "Retired", false);
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [
    [USER_A, USER_B],
  ]);
  await dataSource.destroy();
});

test("a queued badge is released and handed to the realtime channel", { skip }, async () => {
  await enqueue(USER_A, BADGE_ONE, 5);

  const summary = await buildProcessor().processDue();

  assert.deepEqual(summary, { released: 1, suppressed: 0, failed: 0 });
  const [row] = await queue(USER_A);
  assert.equal(row?.status, "released");
  assert.ok(row?.releasedAt, "a released row carries its release time");

  const [notification] = await notifications(USER_A);
  assert.equal(notification?.notificationType, "badge_earned");
  assert.equal(notification?.title, "Badge unlocked: First Post");
  assert.equal(notification?.message, "Earned First Post");
  assert.deepEqual(published, [
    { userId: USER_A, type: "notification.created" },
  ]);
});

test("two same-day badges are released a day apart", { skip }, async () => {
  await enqueue(USER_A, BADGE_ONE, 10);
  await enqueue(USER_A, BADGE_TWO, 5);
  const processor = buildProcessor();

  await processor.processDue();
  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_ONE}:released`,
    `${BADGE_TWO}:queued`,
  ]);

  // Later the same day: the window is still closed.
  await processor.processDue();
  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_ONE}:released`,
    `${BADGE_TWO}:queued`,
  ]);

  await advanceDay(USER_A);
  await processor.processDue();
  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_ONE}:released`,
    `${BADGE_TWO}:released`,
  ]);
  assert.equal((await notifications(USER_A)).length, 2);
});

test("a backlog drains one per window in the order it was earned", { skip }, async () => {
  // Enqueued out of id order, so the order has to come from enqueuedAt.
  await enqueue(USER_A, BADGE_THREE, 1);
  await enqueue(USER_A, BADGE_ONE, 30);
  await enqueue(USER_A, BADGE_TWO, 20);
  const processor = buildProcessor();

  const releasedOrder: string[] = [];
  for (let day = 0; day < 3; day += 1) {
    await processor.processDue();
    const released = (await queue(USER_A))
      .filter((row) => row.status === "released")
      .map((row) => row.badgeId);
    releasedOrder.push(released[released.length - 1] ?? "none");
    assert.equal(released.length, day + 1);
    await advanceDay(USER_A);
  }

  assert.deepEqual(releasedOrder, [BADGE_ONE, BADGE_TWO, BADGE_THREE]);
});

test("one user's window never holds back another user's badge", { skip }, async () => {
  await enqueue(USER_A, BADGE_ONE, 10);
  await enqueue(USER_A, BADGE_TWO, 5);
  await enqueue(USER_B, BADGE_ONE, 5);

  const summary = await buildProcessor().processDue();

  assert.equal(summary.released, 2);
  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_ONE}:released`,
    `${BADGE_TWO}:queued`,
  ]);
  assert.deepEqual(statuses(await queue(USER_B)), [`${BADGE_ONE}:released`]);
  assert.equal((await notifications(USER_B)).length, 1);
});

// Two replicas ticking at the same moment. Without the per-user lock both see
// "nothing released today" and each releases a different same-day badge.
test("concurrent passes never release two badges for one user", { skip }, async () => {
  await enqueue(USER_A, BADGE_ONE, 10);
  await enqueue(USER_A, BADGE_TWO, 5);

  await Promise.all([
    buildProcessor().processDue(),
    buildProcessor().processDue(),
    buildProcessor().processDue(),
  ]);

  const rows = await queue(USER_A);
  assert.equal(rows.filter((row) => row.status === "released").length, 1);
  assert.equal((await notifications(USER_A)).length, 1);
});

test("a repeated pass is a no-op", { skip }, async () => {
  await enqueue(USER_A, BADGE_ONE, 5);
  const processor = buildProcessor();

  await processor.processDue();
  const second = await processor.processDue();

  assert.deepEqual(second, { released: 0, suppressed: 0, failed: 0 });
  assert.equal((await notifications(USER_A)).length, 1);
  assert.equal(published.length, 1);
});

test("a retired badge is suppressed and does not spend the window", { skip }, async () => {
  await enqueue(USER_A, BADGE_RETIRED, 10);
  await enqueue(USER_A, BADGE_ONE, 5);

  const summary = await buildProcessor().processDue();

  assert.deepEqual(summary, { released: 1, suppressed: 1, failed: 0 });
  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_RETIRED}:suppressed`,
    `${BADGE_ONE}:released`,
  ]);
  const [notification] = await notifications(USER_A);
  assert.equal(notification?.title, "Badge unlocked: First Post");
});

// Opting out of badge notifications silences the inbox entry, not the pacing:
// the release still happens and still spends the window.
test("an opted-out user's badge is still released on schedule", { skip }, async () => {
  await dataSource.query(
    `INSERT INTO "notification_preference"
       ("userId", "notificationType", "channel", "optedOut")
     VALUES ($1, 'badge_earned', 'in_app', true)`,
    [USER_A],
  );
  await enqueue(USER_A, BADGE_ONE, 10);
  await enqueue(USER_A, BADGE_TWO, 5);

  await buildProcessor().processDue();

  assert.deepEqual(statuses(await queue(USER_A)), [
    `${BADGE_ONE}:released`,
    `${BADGE_TWO}:queued`,
  ]);
  assert.equal((await notifications(USER_A)).length, 0);
});
