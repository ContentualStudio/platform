import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../../database/testing/test-data-source";
import { AdminUserDetailService } from "./admin-user-detail.service";
import { AdminUsersService } from "./admin-users.service";

const TOKEN = "zzadmindetail";
const FULL = `${TOKEN}-full`;
const BARE = `${TOKEN}-bare`;
const BADGE_DOC = `${TOKEN}-badge`;
const GONE_BADGE = `${TOKEN}-deleted-badge`;
const now = new Date("2026-10-05T12:00:00.000Z");

let dataSource: DataSource;
let detail: AdminUserDetailService;

async function clear() {
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [[FULL, BARE]]);
  await dataSource.query(`DELETE FROM "engine_badges" WHERE "sourceDocumentId" = $1`, [BADGE_DOC]);
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  detail = new AdminUserDetailService(dataSource);
  await clear();

  for (const id of [FULL, BARE]) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)`,
      [id, `${id}@example.test`],
    );
  }

  await dataSource.query(
    `INSERT INTO "user_streak" ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength")
     VALUES ($1, '2026-10-04', '2026-09-28', 7, 12)`,
    [FULL],
  );
  await dataSource.query(`INSERT INTO "user_level" ("userId", "level") VALUES ($1, 'Silver')`, [FULL]);
  for (const task of ["t1", "t2", "t3"]) {
    await dataSource.query(
      `INSERT INTO "programme_task_progress"
         ("assignmentId", "userId", "programmeId", "taskId", "outcome", "weekIndex", "contentType", "localDate")
       VALUES (gen_random_uuid(), $1, 'growth', $2, 'completed', 1, 'reel', '2026-10-01')`,
      [FULL, task],
    );
  }

  await dataSource.query(
    `INSERT INTO "engine_badges" ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "description")
     VALUES ($1, now(), now(), $2, 'First Week', 'Seven days in a row')`,
    [BADGE_DOC, `${TOKEN}-first-week`],
  );
  for (const [badgeId, earnedAt] of [
    [BADGE_DOC, "2026-09-20T10:00:00Z"],
    [GONE_BADGE, "2026-09-25T10:00:00Z"],
  ]) {
    await dataSource.query(
      `INSERT INTO "user_achievement" ("userId", "badgeId", "ruleId", "eventId", "createdAt")
       VALUES ($1, $2, 'rule', $3, $4)`,
      [FULL, badgeId, `${TOKEN}-${badgeId}`, earnedAt],
    );
  }

  // An older, disconnected connection and the current one: the newest wins.
  await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "connectedAt", "disconnectedAt", "status", "dataConsent", "consentGrantedAt")
     VALUES ($1, 'instagram', 'ext-1', 'old_handle', 1, '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z', 'disconnected', true, '2026-08-01T00:00:00Z'),
            ($1, 'instagram', 'ext-2', 'new_handle', 2, '2026-09-01T00:00:00Z', NULL, 'connected', true, '2026-09-01T00:00:00Z')`,
    [FULL],
  );
  for (const [localDate, available, pulledAt] of [
    ["2026-10-03", true, "2026-10-03T07:00:00Z"],
    ["2026-10-04", false, "2026-10-04T07:00:00Z"],
  ] as const) {
    await dataSource.query(
      `INSERT INTO "instagram_account_metric" ("userId", "localDate", "followerCount", "metricsAvailable", "pulledAt")
       VALUES ($1, $2, 100, $3, $4)`,
      [FULL, localDate, available, pulledAt],
    );
  }
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await clear();
  await dataSource.destroy();
});

test("progress reads the live streak and level", { skip }, async () => {
  assert.deepEqual(await detail.progress(FULL, now), {
    currentStreak: 7,
    longestStreak: 12,
    level: "Silver",
  });
});

test("a user with no activity sits at the base level with zeros", { skip }, async () => {
  assert.deepEqual(await detail.progress(BARE, now), {
    currentStreak: 0,
    longestStreak: 0,
    level: "Bronze",
  });
});

test("badges list newest first and keep a badge whose catalogue row is gone", { skip }, async () => {
  const { badges } = await detail.badges(FULL);

  assert.deepEqual(
    badges.map((badge) => [badge.badgeId, badge.name]),
    [
      [GONE_BADGE, null],
      [BADGE_DOC, "First Week"],
    ],
  );
  assert.deepEqual(await detail.badges(BARE), { badges: [] });
});

test("platform shows the newest connection, its consent and the last successful pull", { skip }, async () => {
  const { instagram } = await detail.platform(FULL);

  assert.equal(instagram?.username, "new_handle");
  assert.equal(instagram?.status, "connected");
  assert.deepEqual(instagram?.consent, { granted: true, grantedAt: "2026-09-01T00:00:00.000Z" });
  // The later pull returned no metrics, so it is not a successful sync.
  assert.equal(instagram?.lastSyncedAt, "2026-10-03T07:00:00.000Z");
});

test("a user who never connected has no platform", { skip }, async () => {
  assert.deepEqual(await detail.platform(BARE), { instagram: null });
});

test("the header 404s for an unknown user and matches the list row otherwise", { skip }, async () => {
  const users = new AdminUsersService(dataSource);

  await assert.rejects(users.findOne(`${TOKEN}-nobody`), (error: unknown) =>
    (error as { getStatus(): number }).getStatus() === 404,
  );
  assert.equal((await users.findOne(FULL, now)).currentStreak, 7);
});
