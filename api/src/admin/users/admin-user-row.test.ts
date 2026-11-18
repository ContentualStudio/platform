import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentStreak,
  toAdminUserListRow,
  type AdminUserListRecord,
} from "./admin-user-row";
import { adminUsersQuerySchema, containsPattern } from "./admin-users.schemas";

const now = new Date("2026-10-05T10:00:00.000Z");

function record(overrides: Partial<AdminUserListRecord> = {}): AdminUserListRecord {
  return {
    id: "u-1",
    name: "Ada",
    email: "ada@example.test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    isFoundingCreator: false,
    subscriptionStatus: null,
    subscriptionTier: null,
    programmeSlug: null,
    programmeTitle: null,
    streakLength: null,
    streakLastActiveDate: null,
    streakBrokenAt: null,
    timezone: null,
    lastSeenAt: null,
    avatarVersion: null,
    ...overrides,
  };
}

const streak = (lastActiveDate: string, timezone: string | null = "UTC") => ({
  length: 12,
  lastActiveDate,
  brokenAt: null,
  timezone,
});

test("a streak active today or yesterday is live", () => {
  assert.equal(currentStreak(streak("2026-10-05"), now), 12);
  assert.equal(currentStreak(streak("2026-10-04"), now), 12);
});

test("a stored streak older than yesterday reads as zero", () => {
  assert.equal(currentStreak(streak("2026-10-03"), now), 0);
});

test("a swept break reads as zero even inside the window", () => {
  assert.equal(
    currentStreak({ ...streak("2026-10-05"), brokenAt: new Date() }, now),
    0,
  );
});

test("yesterday is the user's yesterday, not the server's", () => {
  // 12:00 UTC: already 01:00 on the 6th in Auckland (UTC+13), still 05:00 on
  // the 5th in Los Angeles.
  const noonUtc = new Date("2026-10-05T12:00:00.000Z");

  assert.equal(currentStreak(streak("2026-10-04", "Pacific/Auckland"), noonUtc), 0);
  assert.equal(currentStreak(streak("2026-10-04", "America/Los_Angeles"), noonUtc), 12);
});

test("an unknown timezone falls back to UTC rather than throwing", () => {
  assert.equal(currentStreak(streak("2026-10-04", "Not/AZone"), now), 12);
});

test("no streak row is zero", () => {
  assert.equal(currentStreak(null, now), 0);
});

test("a bare user lists with every optional cell empty", () => {
  assert.deepEqual(toAdminUserListRow(record(), now), {
    id: "u-1",
    name: "Ada",
    email: "ada@example.test",
    signedUpAt: "2026-01-01T00:00:00.000Z",
    avatarVersion: null,
    isFoundingCreator: false,
    tier: "free",
    currentProgramme: null,
    currentStreak: 0,
    lastActive: null,
  });
});

test("a lapsed paid subscription shows as Free", () => {
  assert.equal(
    toAdminUserListRow(record({ subscriptionStatus: "canceled", subscriptionTier: "pro" }), now)
      .tier,
    "free",
  );
  assert.equal(
    toAdminUserListRow(record({ subscriptionStatus: "active", subscriptionTier: "pro" }), now)
      .tier,
    "pro",
  );
});

test("a programme missing from the mirror keeps its slug with no title", () => {
  assert.deepEqual(
    toAdminUserListRow(record({ programmeSlug: "60-day-reset" }), now).currentProgramme,
    { slug: "60-day-reset", title: null },
  );
});

test("last active prefers session time and falls back to the task day", () => {
  const seen = new Date("2026-10-05T09:00:00.000Z");

  assert.deepEqual(
    toAdminUserListRow(
      record({ lastSeenAt: seen, streakLength: 3, streakLastActiveDate: "2026-10-01" }),
      now,
    ).lastActive,
    { at: seen.toISOString(), precision: "time" },
  );
  assert.deepEqual(
    toAdminUserListRow(record({ streakLength: 3, streakLastActiveDate: "2026-10-01" }), now)
      .lastActive,
    { at: "2026-10-01T00:00:00.000Z", precision: "day" },
  );
});

test("search wildcards are matched literally", () => {
  assert.equal(containsPattern("50%_off\\"), "%50\\%\\_off\\\\%");
  assert.equal(containsPattern("Ada"), "%ada%");
});

test("query defaults, blank search and page-size bounds", () => {
  const defaults = adminUsersQuerySchema.parse({});
  assert.equal(defaults.q, undefined);
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 25);
  assert.equal(adminUsersQuerySchema.parse({ q: "   " }).q, undefined);
  assert.equal(adminUsersQuerySchema.parse({ page: "3", pageSize: "50" }).page, 3);
  assert.equal(adminUsersQuerySchema.safeParse({ pageSize: "1000" }).success, false);
  assert.equal(adminUsersQuerySchema.safeParse({ page: "0" }).success, false);
});
