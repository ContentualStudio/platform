import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { UserAchievementsService } from "./user-achievements.service";

const TOKEN = "zzuserachievements";
const USER = `${TOKEN}-user`;
const LAPSED = `${TOKEN}-lapsed`;
const BADGE = `${TOKEN}-badge`;
const GONE_BADGE = `${TOKEN}-gone`;
const now = new Date("2026-10-20T12:00:00.000Z");

let dataSource: DataSource;
let service: UserAchievementsService;

async function clear() {
  await dataSource.query(`DELETE FROM "engine_badges" WHERE "sourceDocumentId" LIKE $1`, [`${TOKEN}%`]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [[USER, LAPSED]]);
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  service = new UserAchievementsService(dataSource);
  await clear();

  for (const id of [USER, LAPSED]) {
    await dataSource.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)`, [
      id,
      `${id}@example.test`,
    ]);
  }
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "description", "active")
     VALUES ($1, now(), now(), 'first-take', 'First Take', 'Earned it', true)`,
    [BADGE],
  );
  await dataSource.query(
    `INSERT INTO "user_achievement" ("userId", "badgeId", "ruleId", "eventId", "createdAt")
     VALUES ($1, $2, 'rule', 'event-1', '2026-10-10T08:00:00Z'),
            ($1, $3, 'rule', 'event-2', '2026-10-12T08:00:00Z')`,
    [USER, BADGE, GONE_BADGE],
  );
  // Active yesterday: still live. The lapsed user last showed up a week ago.
  await dataSource.query(
    `INSERT INTO "user_streak" ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength")
     VALUES ($1, '2026-10-19', '2026-10-15', 5, 5), ($2, '2026-10-13', '2026-10-01', 13, 13)`,
    [USER, LAPSED],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await clear();
  await dataSource.destroy();
});

test("earned badges come newest first, and a removed badge keeps its id", { skip }, async () => {
  const { badges } = await service.forUser(USER, now);

  assert.deepEqual(
    badges.map((badge) => [badge.badgeId, badge.key, badge.name, badge.earnedAt]),
    [
      [GONE_BADGE, null, null, "2026-10-12T08:00:00.000Z"],
      [BADGE, "first-take", "First Take", "2026-10-10T08:00:00.000Z"],
    ],
  );
});

test("the streak is live through yesterday and zero once it has lapsed", { skip }, async () => {
  assert.equal((await service.forUser(USER, now)).currentStreak, 5);
  assert.equal((await service.forUser(LAPSED, now)).currentStreak, 0);
});

test("a user with nothing yet has no badges and no streak", { skip }, async () => {
  assert.deepEqual(await service.forUser(`${TOKEN}-nobody`, now), { currentStreak: 0, badges: [] });
});
