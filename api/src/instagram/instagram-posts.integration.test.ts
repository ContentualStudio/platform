import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { InstagramService } from "./instagram.service";

// The posts read against real tables: the two orderings, the cap and the
// user scoping are SQL, so a fake query router would only be testing itself.
const USER_ID = "instagram-posts-integration-user";
const OTHER_USER_ID = "instagram-posts-integration-other";

let dataSource: DataSource;

function service(): InstagramService {
  return new InstagramService(
    dataSource,
    null as never,
    null as never,
    null as never,
  );
}

async function connectedPosts(userId = USER_ID) {
  const posts = await service().getPosts(userId);
  assert.ok(posts.connected, "expected a connected user");
  return posts;
}

async function connect(userId = USER_ID) {
  await dataSource.query(
    `INSERT INTO "platform_connection"
       ("userId", "platform", "externalAccountId", "username", "connectionOrdinal",
        "accountType", "dataConsent", "status")
     VALUES ($1, 'instagram', $2, $1, 1, 'professional', true, 'connected')`,
    [userId, `ig-${userId}`],
  );
}

async function post(
  mediaId: string,
  values: { views: number | null; postedDaysAgo: number },
  userId = USER_ID,
) {
  await dataSource.query(
    `INSERT INTO "instagram_post"
       ("userId", "mediaId", "mediaType", "postedAt", "caption", "thumbnailUrl",
        "views")
     VALUES ($1, $2, 'IMAGE', now() - make_interval(days => $3), $4, $5, $6)`,
    [
      userId,
      mediaId,
      values.postedDaysAgo,
      `Caption ${mediaId}`,
      `https://cdn.example/${mediaId}.jpg`,
      values.views,
    ],
  );
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
  for (const id of [USER_ID, OTHER_USER_ID]) {
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

  for (const table of ["platform_connection", "instagram_post"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1)`, [
      [USER_ID, OTHER_USER_ID],
    ]);
  }
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [
    [USER_ID, OTHER_USER_ID],
  ]);
  await dataSource.destroy();
});

test("a user with no live connection reads as disconnected", { skip }, async () => {
  assert.deepEqual(await service().getPosts(USER_ID), { connected: false });
});

test("a connected user with no posts has two empty lists", { skip }, async () => {
  await connect();

  assert.deepEqual(await service().getPosts(USER_ID), {
    connected: true,
    recent: [],
    top: [],
  });
});

test("a post carries its caption, image and publish time", { skip }, async () => {
  await connect();
  await post("a", { views: 400, postedDaysAgo: 5 });

  const [first] = (await connectedPosts()).recent;

  assert.equal(first?.id, "a");
  assert.equal(first?.caption, "Caption a");
  assert.equal(first?.thumbnailUrl, "https://cdn.example/a.jpg");
  assert.ok(first?.postedAt instanceof Date);
});

test("recent is newest first and top is most viewed first", { skip }, async () => {
  await connect();
  await post("old-hit", { views: 9_000, postedDaysAgo: 30 });
  await post("new", { views: 50, postedDaysAgo: 1 });
  await post("mid", { views: 700, postedDaysAgo: 10 });

  const posts = await connectedPosts();

  assert.deepEqual(
    posts.recent.map((post) => post.id),
    ["new", "mid", "old-hit"],
  );
  assert.deepEqual(
    posts.top.map((post) => post.id),
    ["old-hit", "mid", "new"],
  );
});

test("absent metrics stay null and a post with no views is not ranked", { skip }, async () => {
  await connect();
  await post("unviewed", { views: null, postedDaysAgo: 1 });
  await post("viewed", { views: 10, postedDaysAgo: 2 });

  const posts = await connectedPosts();

  assert.equal(posts.recent[0]?.id, "unviewed");
  assert.equal(posts.recent[0]?.views, null);
  assert.equal(posts.recent[0]?.comments, null);
  assert.deepEqual(
    posts.top.map((post) => post.id),
    ["viewed"],
  );
});

test("each list is capped", { skip }, async () => {
  await connect();
  for (let index = 0; index < 12; index += 1) {
    await post(`p${index}`, { views: index, postedDaysAgo: index });
  }

  const posts = await connectedPosts();

  assert.equal(posts.recent.length, 10);
  assert.equal(posts.top.length, 10);
});

test("another user's posts are never returned", { skip }, async () => {
  await connect();
  await connect(OTHER_USER_ID);
  await post("theirs", { views: 5, postedDaysAgo: 1 }, OTHER_USER_ID);

  const posts = await connectedPosts();

  assert.deepEqual(posts.recent, []);
  assert.deepEqual(posts.top, []);
});
