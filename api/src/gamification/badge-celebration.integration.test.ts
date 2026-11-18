import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { BadgeCelebrationService } from "./badge-celebration.service";

// The celebration reads and writes against real tables: the pending filter,
// the ordering and the per-user scoping are all SQL.
const USER_A = "badge-celebration-integration-user-a";
const USER_B = "badge-celebration-integration-user-b";

let dataSource: DataSource;

function service(): BadgeCelebrationService {
  return new BadgeCelebrationService(dataSource);
}

async function seedBadge(id: string, name: string) {
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "description", "active")
     VALUES ($1, now(), now(), $1, $2, $3, true)`,
    [id, name, `Earned ${name}`],
  );
}

/** A queue row in the given state; returns its id. */
async function queued(
  userId: string,
  badgeId: string,
  state: { status: string; releasedMinutesAgo?: number; shown?: boolean },
): Promise<string> {
  const [row] = (await dataSource.query(
    `INSERT INTO "badge_cooldown_queue"
       ("userId", "badgeId", "ruleId", "eventId", "status", "releasedAt", "shownAt")
     VALUES ($1, $2, 'rule', 'event', $3,
             CASE WHEN $4::int IS NULL THEN NULL
                  ELSE now() - make_interval(mins => $4::int) END,
             CASE WHEN $5 THEN now() END)
     RETURNING "id"`,
    [userId, badgeId, state.status, state.releasedMinutesAgo ?? null, state.shown ?? false],
  )) as { id: string }[];

  return String(row?.id);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
  for (const id of [USER_A, USER_B]) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)
       ON CONFLICT ("id") DO NOTHING`,
      [id, `${id}@example.test`],
    );
  }
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  for (const table of ["badge_cooldown_queue", "engine_badges"]) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await seedBadge("first-post", "First Post");
  await seedBadge("week-streak", "Week Streak");
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [[USER_A, USER_B]]);
  await dataSource.destroy();
});

test("released, unshown badges are pending, oldest release first", { skip }, async () => {
  await queued(USER_A, "week-streak", { status: "released", releasedMinutesAgo: 5 });
  await queued(USER_A, "first-post", { status: "released", releasedMinutesAgo: 60 * 30 });

  const pending = await service().listPending(USER_A);

  assert.deepEqual(
    pending.map((item) => [item.key, item.name, item.description]),
    [
      ["first-post", "First Post", "Earned First Post"],
      ["week-streak", "Week Streak", "Earned Week Streak"],
    ],
  );
});

test("queued, suppressed and already-shown badges are not pending", { skip }, async () => {
  await seedBadge("hundred-club", "Hundred Club");
  await queued(USER_A, "first-post", { status: "queued" });
  await queued(USER_A, "week-streak", { status: "suppressed" });
  await queued(USER_A, "hundred-club", { status: "released", releasedMinutesAgo: 5, shown: true });

  assert.deepEqual(await service().listPending(USER_A), []);
});

test("marking a celebration shown removes it from pending, and is idempotent", { skip }, async () => {
  const id = await queued(USER_A, "first-post", { status: "released", releasedMinutesAgo: 5 });

  assert.equal(await service().markShown(USER_A, id), true);
  const [first] = (await dataSource.query(
    `SELECT "shownAt" FROM "badge_cooldown_queue" WHERE "id" = $1`,
    [id],
  )) as { shownAt: Date }[];

  // A retried request still succeeds and keeps the first shownAt.
  assert.equal(await service().markShown(USER_A, id), true);
  const [second] = (await dataSource.query(
    `SELECT "shownAt" FROM "badge_cooldown_queue" WHERE "id" = $1`,
    [id],
  )) as { shownAt: Date }[];

  assert.deepEqual(await service().listPending(USER_A), []);
  assert.equal(second?.shownAt.getTime(), first?.shownAt.getTime());
});

test("a user can neither see nor mark another user's celebration", { skip }, async () => {
  const id = await queued(USER_B, "first-post", { status: "released", releasedMinutesAgo: 5 });

  assert.deepEqual(await service().listPending(USER_A), []);
  assert.equal(await service().markShown(USER_A, id), false);
  assert.equal((await service().listPending(USER_B)).length, 1);
});

test("a badge still queued cannot be marked shown", { skip }, async () => {
  const id = await queued(USER_A, "first-post", { status: "queued" });

  assert.equal(await service().markShown(USER_A, id), false);
});

test("a malformed id is simply not found", { skip }, async () => {
  assert.equal(await service().markShown(USER_A, "not-a-number"), false);
  assert.equal(await service().markShown(USER_A, "99999999999999999999999"), false);
});
