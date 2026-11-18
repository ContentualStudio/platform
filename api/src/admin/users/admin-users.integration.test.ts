import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase,
} from "../../database/testing/test-data-source";
import { adminUsersQuerySchema } from "./admin-users.schemas";
import { AdminUsersService } from "./admin-users.service";

// Every fixture carries this token, and every query searches for it, so the
// suite is unaffected by whatever else the shared test database holds.
const TOKEN = "zzadminlist";
const PROGRAMME_SLUG = `${TOKEN}-programme`;
const ORPHAN_SLUG = `${TOKEN}-unpublished`;
const now = new Date("2026-10-05T12:00:00.000Z");

let dataSource: DataSource;
let service: AdminUsersService;

const users = [
  // Oldest first; the list is newest first.
  { id: `${TOKEN}-bare`, name: "Bare Minimum", createdAt: "2026-01-01T00:00:00Z" },
  { id: `${TOKEN}-full`, name: "Full House", createdAt: "2026-02-01T00:00:00Z" },
  { id: `${TOKEN}-orphan`, name: "Orphan Journey", createdAt: "2026-03-01T00:00:00Z" },
  { id: `${TOKEN}-pct`, name: "Percent 50%_Off", createdAt: "2026-04-01T00:00:00Z" },
];

function query(input: Record<string, unknown>) {
  return adminUsersQuerySchema.parse({ q: TOKEN, ...input });
}

async function cleanup() {
  const ids = users.map((user) => user.id);

  // Better Auth's session table has no foreign key to user, so it does not
  // cascade; clear it explicitly.
  await dataSource.query(`DELETE FROM "session" WHERE "userId" = ANY($1)`, [ids]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [ids]);
  await dataSource.query(`DELETE FROM "programme" WHERE "slug" = $1`, [PROGRAMME_SLUG]);
}

before(async () => {
  if (skipWithoutDatabase) return;

  dataSource = await openTestDataSource();
  service = new AdminUsersService(dataSource);
  await cleanup();

  for (const user of users) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $4)`,
      [user.id, user.name, `${user.id}@example.test`, user.createdAt],
    );
  }

  const full = `${TOKEN}-full`;

  await dataSource.query(
    `INSERT INTO "programme" ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title")
     VALUES ($1, now(), now(), $2, 'Sixty Day Reset')`,
    [`${TOKEN}-doc`, PROGRAMME_SLUG],
  );
  await dataSource.query(
    `INSERT INTO "billing_account" ("userId", "referralCode", "isFoundingCreator")
     VALUES ($1, $2, true)`,
    [full, `${TOKEN}-ref`],
  );
  await dataSource.query(
    `INSERT INTO "user_subscription" ("userId", "stripeSubscriptionId", "stripePriceId", "tier", "status")
     VALUES ($1, 'sub_x', 'price_x', 'pro', 'active')`,
    [full],
  );
  for (const [userId, slug] of [
    [full, PROGRAMME_SLUG],
    [`${TOKEN}-orphan`, ORPHAN_SLUG],
  ]) {
    await dataSource.query(
      `INSERT INTO "programme_enrolment"
         ("userId", "programmeSlug", "status", "startedAt", "currentDay", "durationDays", "day1ScheduledFor")
       VALUES ($1, $2, 'active', now(), 3, 60, '2026-10-01')`,
      [userId, slug],
    );
  }
  // A finished journey must not be mistaken for the current one.
  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("userId", "programmeSlug", "status", "startedAt", "currentDay", "durationDays", "day1ScheduledFor", "completedAt")
     VALUES ($1, $2, 'completed', now(), 30, 30, '2026-08-01', now())`,
    [full, ORPHAN_SLUG],
  );
  await dataSource.query(
    `INSERT INTO "user_avatar" ("userId", "contentType", "bytes", "byteSize", "etag")
     VALUES ($1, 'image/png', '\\x89504e47'::bytea, 4, $2)`,
    [full, `${TOKEN}-etag`],
  );
  await dataSource.query(
    `INSERT INTO "user_streak" ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength")
     VALUES ($1, '2026-10-04', '2026-09-25', 10, 10)`,
    [full],
  );
  for (const [token, updatedAt] of [
    ["a", "2026-10-03T08:00:00Z"],
    ["b", "2026-10-05T09:30:00Z"],
  ]) {
    await dataSource.query(
      `INSERT INTO "session" ("id", "token", "expiresAt", "userId", "updatedAt")
       VALUES ($1, $2, now() + interval '1 day', $3, $4)`,
      [`${full}-${token}`, `${full}-${token}`, full, updatedAt],
    );
  }
});

after(async () => {
  if (skipWithoutDatabase) return;

  await cleanup();
  await dataSource.destroy();
});

test("lists every matching user newest first with a total", { skip: skipWithoutDatabase }, async () => {
  const page = await service.list(query({}), now);

  assert.equal(page.total, 4);
  assert.deepEqual(
    page.users.map((user) => user.id),
    [`${TOKEN}-pct`, `${TOKEN}-orphan`, `${TOKEN}-full`, `${TOKEN}-bare`],
  );
});

test("joins every operational fact onto one row without duplicating it", { skip: skipWithoutDatabase }, async () => {
  const page = await service.list(query({ q: `${TOKEN}-full` }), now);

  assert.equal(page.users.length, 1);
  assert.deepEqual(page.users[0], {
    id: `${TOKEN}-full`,
    name: "Full House",
    email: `${TOKEN}-full@example.test`,
    signedUpAt: "2026-02-01T00:00:00.000Z",
    avatarVersion: `${TOKEN}-etag`,
    isFoundingCreator: true,
    tier: "pro",
    currentProgramme: { slug: PROGRAMME_SLUG, title: "Sixty Day Reset" },
    currentStreak: 10,
    lastActive: { at: "2026-10-05T09:30:00.000Z", precision: "time" },
  });
});

test("a user with nothing attached still lists cleanly", { skip: skipWithoutDatabase }, async () => {
  const [bare] = (await service.list(query({ q: `${TOKEN}-bare` }), now)).users;

  assert.deepEqual(
    {
      tier: bare?.tier,
      founding: bare?.isFoundingCreator,
      programme: bare?.currentProgramme,
      streak: bare?.currentStreak,
      lastActive: bare?.lastActive,
    },
    { tier: "free", founding: false, programme: null, streak: 0, lastActive: null },
  );
});

test("an active journey whose programme left the mirror keeps its slug", { skip: skipWithoutDatabase }, async () => {
  const [orphan] = (await service.list(query({ q: `${TOKEN}-orphan` }), now)).users;

  assert.deepEqual(orphan?.currentProgramme, { slug: ORPHAN_SLUG, title: null });
});

test("search matches names case-insensitively and wildcards literally", { skip: skipWithoutDatabase }, async () => {
  const byName = await service.list(adminUsersQuerySchema.parse({ q: "FULL HOUSE" }), now);
  assert.ok(byName.users.some((user) => user.id === `${TOKEN}-full`));

  const literal = await service.list(adminUsersQuerySchema.parse({ q: "50%_off" }), now);
  assert.deepEqual(
    literal.users.filter((user) => user.id.startsWith(TOKEN)).map((user) => user.id),
    [`${TOKEN}-pct`],
  );
});

test("pages are stable slices of the same ordering", { skip: skipWithoutDatabase }, async () => {
  const all = (await service.list(query({ pageSize: 25 }), now)).users.map((user) => user.id);
  const pageSize = 25;
  const first = await service.list(query({ pageSize, page: 1 }), now);
  const beyond = await service.list(query({ pageSize, page: 2 }), now);

  assert.deepEqual(first.users.map((user) => user.id), all);
  assert.equal(beyond.users.length, 0);
  assert.equal(beyond.total, 4);
});

test("no match is an empty page, not an error", { skip: skipWithoutDatabase }, async () => {
  const page = await service.list(query({ q: `${TOKEN}-nobody-by-this-name` }), now);

  assert.equal(page.total, 0);
  assert.deepEqual(page.users, []);
});
