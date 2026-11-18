import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import type { ConfigService } from "@nestjs/config";
import { apiSuccess, type InstagramApiPort } from "./instagram-api.port";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { InstagramTokenService } from "./instagram-token.service";

// The claim this suite exists to prove: the cascade removes everything derived
// from Instagram and nothing else. Survivors are as much a requirement as
// deletions — a user who disconnects must keep their account, their programme
// progress and the badges they earned by doing the work.

const USER = "instagram-purge-user";
const OTHER = "instagram-purge-other";
const key = Buffer.alloc(32, 13);

let dataSource: DataSource;

function services() {
  const config = {
    get: (path: string) =>
      path === "instagram.tokenKey"
        ? key
        : path === "instagram.tokenKeyId"
          ? "v1"
          : undefined,
  } as unknown as ConfigService;

  const tokens = new InstagramTokenService(dataSource, config);
  const api = {
    revoke: async () => apiSuccess(undefined),
  } as unknown as InstagramApiPort;

  return { tokens, purge: new InstagramDataPurgeService(dataSource, tokens, api) };
}

async function seed(userId: string) {
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [userId, userId, `${userId}@example.test`],
  );

  const [connection] = (await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "status")
     VALUES ($1, 'instagram', $2, $3, 1, 'professional', true, 'connected')
     RETURNING "id"`,
    [userId, `ig-${userId}`, userId],
  )) as { id: string }[];

  const { tokens } = services();
  await tokens.storeToken({
    userId,
    connectionId: String(connection.id),
    accessToken: "IGQVJpurgetesttokenvalue",
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic"],
  });

  await dataSource.query(
    `INSERT INTO "follower_snapshot" ("userId", "platform", "localDate", "followerCount")
     VALUES ($1, 'instagram', CURRENT_DATE, 1200)`,
    [userId],
  );
  await dataSource.query(
    `INSERT INTO "follower_milestone" ("userId", "platform", "tier", "followerCount")
     VALUES ($1, 'instagram', 100, 1200)`,
    [userId],
  );
  await dataSource.query(
    `INSERT INTO "instagram_account_metric" ("userId", "localDate", "followerCount")
     VALUES ($1, CURRENT_DATE, 1200)`,
    [userId],
  );
  await dataSource.query(
    `INSERT INTO "instagram_post" ("userId", "mediaId", "views") VALUES ($1, 'm1', 10)`,
    [userId],
  );
  await dataSource.query(
    `INSERT INTO "instagram_post_metric" ("userId", "mediaId", "localDate", "views")
     VALUES ($1, 'media-1', CURRENT_DATE, 900)`,
    [userId],
  );

  // Two events with two badges: one earned from follower growth, one from
  // doing the work. Only the first may be erased.
  const followerEvent = `${eventNameTokens.followerMilestone}:${userId}:100`;
  const taskEvent = `${eventNameTokens.taskCompleted}:${userId}:day-1`;

  for (const [id, name] of [
    [followerEvent, eventNameTokens.followerMilestone],
    [taskEvent, eventNameTokens.taskCompleted],
  ]) {
    await dataSource.query(
      `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
       VALUES ($1, $2, $3, '{}'::jsonb)`,
      [id, name, userId],
    );
  }

  for (const [badgeId, eventId] of [
    ["follower-100", followerEvent],
    ["first-task", taskEvent],
  ]) {
    await dataSource.query(
      `INSERT INTO "user_achievement" ("userId", "badgeId", "ruleId", "eventId")
       VALUES ($1, $2, 'rule-1', $3)`,
      [userId, badgeId, eventId],
    );
    await dataSource.query(
      `INSERT INTO "badge_cooldown_queue" ("userId", "badgeId", "ruleId", "eventId")
       VALUES ($1, $2, 'rule-1', $3)`,
      [userId, badgeId, eventId],
    );
    await dataSource.query(
      `INSERT INTO "engine_firing_ledger"
         ("ruleId", "userId", "scopeKey", "dedupeScope", "eventRef", "leaseToken")
       VALUES ($1, $2, $3, 'once_per_user', $4, gen_random_uuid())`,
      [`rule-${badgeId}`, userId, badgeId, eventId],
    );
  }

  return String(connection.id);
}

async function countRows(table: string, userId: string): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT COUNT(*)::int AS "count" FROM "${table}" WHERE "userId" = $1`,
    [userId],
  )) as { count: number }[];

  return rows[0].count;
}

async function badgeIds(userId: string): Promise<string[]> {
  const rows = (await dataSource.query(
    `SELECT "badgeId" FROM "user_achievement" WHERE "userId" = $1 ORDER BY "badgeId"`,
    [userId],
  )) as { badgeId: string }[];

  return rows.map((row) => row.badgeId);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

async function clean() {
  for (const userId of [USER, OTHER]) {
    for (const table of [
      "instagram_post",
      "instagram_post_metric",
      "instagram_account_metric",
      "engine_firing_ledger",
      "badge_cooldown_queue",
      "user_achievement",
      "content_engine_events",
      "follower_milestone",
      "follower_snapshot",
      "platform_connection",
    ]) {
      await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [userId]);
    }
    await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [userId]);
  }
}

beforeEach(async () => {
  if (skip) {
    return;
  }

  await clean();
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await clean();
  await dataSource.destroy();
});

test("disconnect erases every Instagram-derived row", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  for (const table of [
    "platform_connection_credential",
    "instagram_post",
    "instagram_post_metric",
    "instagram_account_metric",
    "follower_snapshot",
    "follower_milestone",
  ]) {
    assert.equal(await countRows(table, USER), 0, `${table} must be empty`);
  }
});

// The other half of the requirement, and the easier one to get wrong.
test("the account, its progress and task badges survive", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  const users = (await dataSource.query(`SELECT 1 FROM "user" WHERE "id" = $1`, [
    USER,
  ])) as unknown[];

  assert.equal(users.length, 1, "the account must survive");
  assert.deepEqual(
    await badgeIds(USER),
    ["first-task"],
    "a badge earned by doing the work must survive",
  );
});

test("follower badges and their cooldown rows go", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  const cooldowns = (await dataSource.query(
    `SELECT "badgeId" FROM "badge_cooldown_queue" WHERE "userId" = $1`,
    [USER],
  )) as { badgeId: string }[];

  assert.deepEqual(cooldowns.map((row) => row.badgeId), ["first-task"]);
});

// The subtle one: leaving the ledger behind means a user who reconnects and
// crosses 100 again silently gets nothing, because the ledger still believes
// the rule fired for them.
test("the firing ledger is cleared so a reconnect can fire again", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  const ledger = (await dataSource.query(
    `SELECT "ruleId" FROM "engine_firing_ledger" WHERE "userId" = $1`,
    [USER],
  )) as { ruleId: string }[];

  assert.deepEqual(ledger.map((row) => row.ruleId), ["rule-first-task"]);
});

test("follower events are erased and unrelated events kept", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  const events = (await dataSource.query(
    `SELECT "eventName" FROM "content_engine_events" WHERE "userId" = $1`,
    [USER],
  )) as { eventName: string }[];

  assert.deepEqual(events.map((row) => row.eventName), [
    eventNameTokens.taskCompleted,
  ]);
});

// The connection row mints connectionOrdinal, a segment of the
// platform.connected stable id. Dropping it would reset the ordinal and make
// the next connect replay an id the outbox already holds.
test("disconnect keeps the connection row so a reconnect is a new event", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "disconnect");

  const rows = (await dataSource.query(
    `SELECT "connectionOrdinal", "status", "dataConsent", "disconnectedAt"
       FROM "platform_connection" WHERE "userId" = $1`,
    [USER],
  )) as {
    connectionOrdinal: number;
    status: string;
    dataConsent: boolean;
    disconnectedAt: Date | null;
  }[];

  assert.equal(rows.length, 1);
  assert.equal(rows[0].connectionOrdinal, 1);
  assert.equal(rows[0].status, "disconnected");
  assert.equal(rows[0].dataConsent, false);
  assert.ok(rows[0].disconnectedAt);
});

// Meta's callback is a legal erasure request, so the row goes too.
test("erase mode removes the connection row entirely", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  await purge.purge(USER, "erase");

  assert.equal(await countRows("platform_connection", USER), 0);
  // The account itself is still not ours to delete on a platform request.
  const users = (await dataSource.query(`SELECT 1 FROM "user" WHERE "id" = $1`, [
    USER,
  ])) as unknown[];
  assert.equal(users.length, 1);
});

test("purging is idempotent, so a failed run can simply be repeated", { skip }, async () => {
  await seed(USER);
  const { purge } = services();

  const first = await purge.purge(USER, "disconnect");
  const second = await purge.purge(USER, "disconnect");

  assert.ok(first.rowsDeleted > 0);
  assert.equal(second.rowsDeleted, 0);
  assert.deepEqual(await badgeIds(USER), ["first-task"]);
});

test("one user's purge never touches another user's data", { skip }, async () => {
  await seed(USER);
  await seed(OTHER);
  const { purge } = services();

  await purge.purge(USER, "erase");

  assert.equal(await countRows("platform_connection", OTHER), 1);
  assert.equal(await countRows("follower_snapshot", OTHER), 1);
  assert.equal(await countRows("platform_connection_credential", OTHER), 1);
  assert.deepEqual(await badgeIds(OTHER), ["first-task", "follower-100"]);
});
