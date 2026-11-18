import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { DataSource } from "typeorm";
import { localDateFor } from "../common/timezone";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { InstagramService } from "./instagram.service";

// The growth read against real tables: the connect-day floor and the 90-day
// ceiling are SQL, so a fake query router would only be testing itself.
const USER_ID = "follower-growth-integration-user";

let dataSource: DataSource;

function service(): InstagramService {
  return new InstagramService(
    dataSource,
    null as never,
    null as never,
    null as never,
  );
}

async function connectedGrowth() {
  const growth = await service().getFollowerGrowth(USER_ID);
  assert.ok(growth.connected, "expected a connected user");
  return growth;
}

async function connect(daysAgo: number) {
  await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "status", "connectedAt")
     VALUES ($1, 'instagram', $2, $1, 1, 'professional', true, 'connected',
             now() - make_interval(days => $3))`,
    [USER_ID, `ig-${USER_ID}`, daysAgo],
  );
}

async function snapshot(daysAgo: number, followers: number) {
  await dataSource.query(
    `INSERT INTO "follower_snapshot" ("userId", "platform", "localDate", "followerCount")
     VALUES ($1, 'instagram', (now() AT TIME ZONE 'UTC')::date - $2::int, $3)`,
    [USER_ID, daysAgo, followers],
  );
}

async function setTimezone(timezone: string) {
  await dataSource.query(
    `INSERT INTO "user_profile" ("userId", "timezone") VALUES ($1, $2)
     ON CONFLICT ("userId") DO UPDATE SET "timezone" = EXCLUDED."timezone"`,
    [USER_ID, timezone],
  );
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, `${USER_ID}@example.test`],
  );
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  for (const table of ["platform_connection", "follower_snapshot", "user_profile"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  // UTC keeps the seeded snapshot dates and the read's "today" on one clock.
  await setTimezone("UTC");
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("a user with no live connection reads as disconnected", { skip }, async () => {
  assert.deepEqual(await service().getFollowerGrowth(USER_ID), {
    connected: false,
  });
});

test("history starts on connect day and runs oldest first", { skip }, async () => {
  await connect(10);
  await snapshot(12, 900); // before connect day: never shown
  await snapshot(0, 1_300);
  await snapshot(9, 1_000);
  await snapshot(5, 1_150);

  const growth = await connectedGrowth();

  assert.equal(growth.today, localDateFor(new Date(), "UTC"));
  assert.deepEqual(
    growth.points.map((point) => point.followers),
    [1_000, 1_150, 1_300],
  );
  assert.match(growth.points[0]?.date ?? "", /^\d{4}-\d{2}-\d{2}$/);
});

test("history is capped at the last 90 local days", { skip }, async () => {
  await connect(200);
  await snapshot(95, 500);
  await snapshot(90, 600);
  await snapshot(89, 700);
  await snapshot(0, 800);

  const growth = await connectedGrowth();

  assert.deepEqual(
    growth.points.map((point) => point.followers),
    [700, 800],
  );
});

test("a connected user with no snapshots yet has an empty history", { skip }, async () => {
  await connect(0);

  const growth = await connectedGrowth();

  assert.deepEqual(growth.points, []);
});

test("an unrecognised timezone falls back to UTC instead of failing", { skip }, async () => {
  await setTimezone("Not/AZone");
  await connect(3);
  await snapshot(1, 42);

  const growth = await connectedGrowth();

  assert.equal(growth.today, localDateFor(new Date(), "UTC"));
  assert.deepEqual(
    growth.points.map((point) => point.followers),
    [42],
  );
});

test("today follows the user's own timezone", { skip }, async () => {
  await setTimezone("Pacific/Kiritimati");
  await connect(3);

  const growth = await connectedGrowth();

  assert.equal(growth.today, localDateFor(new Date(), "Pacific/Kiritimati"));
});
