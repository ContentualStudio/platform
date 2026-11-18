import * as assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateTime, formatDay, formatLastActive, initials, pageTokens } from "./admin-format";
import {
  adminUsersHref,
  backToUsersHref,
  parseAdminUsersSearch,
  userBackLink,
} from "./admin-users-search";
import { engineActivityHref, parseEngineActivitySearch } from "./engine-activity-search";

const now = new Date("2026-10-05T12:00:00.000Z");

test("days format in UTC regardless of the server's zone", () => {
  assert.equal(formatDay("2026-10-05T23:30:00.000Z"), "5 Oct 2026");
});

test("time-precision last active reads in minutes, hours, then days", () => {
  const at = (iso: string) => formatLastActive({ at: iso, precision: "time" }, now);

  assert.equal(at("2026-10-05T11:59:40.000Z"), "Just now");
  assert.equal(at("2026-10-05T11:15:00.000Z"), "45m ago");
  assert.equal(at("2026-10-05T07:00:00.000Z"), "5h ago");
  assert.equal(at("2026-10-04T08:00:00.000Z"), "Yesterday");
  assert.equal(at("2026-10-01T08:00:00.000Z"), "4 days ago");
  assert.equal(at("2026-08-01T08:00:00.000Z"), "1 Aug 2026");
});

test("day-precision last active never claims hours", () => {
  assert.equal(
    formatLastActive({ at: "2026-10-05T00:00:00.000Z", precision: "day" }, now),
    "Today",
  );
});

test("short page ranges list every page", () => {
  assert.deepEqual(pageTokens(1, 1), [1]);
  assert.deepEqual(pageTokens(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("long page ranges collapse around the current page", () => {
  assert.deepEqual(pageTokens(1, 20), [1, 2, "ellipsis-end", 20]);
  assert.deepEqual(pageTokens(10, 20), [1, "ellipsis-start", 9, 10, 11, "ellipsis-end", 20]);
  assert.deepEqual(pageTokens(20, 20), [1, "ellipsis-start", 19, 20]);
});

test("initials take first and last names", () => {
  assert.equal(initials("Ada Lovelace"), "AL");
  assert.equal(initials("Ada King Lovelace"), "AL");
  assert.equal(initials("ada"), "AD");
  assert.equal(initials("  "), "?");
});

test("junk URL state falls back to defaults", () => {
  assert.deepEqual(parseAdminUsersSearch({}), { q: "", page: 1 });
  assert.deepEqual(parseAdminUsersSearch({ q: "  ada ", page: "3" }), { q: "ada", page: 3 });
  assert.deepEqual(parseAdminUsersSearch({ page: "-2" }), { q: "", page: 1 });
  assert.deepEqual(parseAdminUsersSearch({ page: "2.5", q: ["a", "b"] }), { q: "a", page: 1 });
});

test("hrefs omit defaults and keep the search across pages", () => {
  assert.equal(adminUsersHref({}), "/admin/users");
  assert.equal(adminUsersHref({ q: "ada", page: 1 }), "/admin/users?q=ada");
  assert.equal(adminUsersHref({ q: "ada & co", page: 3 }), "/admin/users?q=ada+%26+co&page=3");
});

test("back-to-users only ever returns a user-list URL", () => {
  assert.equal(backToUsersHref("/admin/users?q=ada&page=2"), "/admin/users?q=ada&page=2");
  assert.equal(backToUsersHref("/admin/users"), "/admin/users");
  assert.equal(backToUsersHref(undefined), "/admin/users");
  assert.equal(backToUsersHref("https://evil.example/admin/users"), "/admin/users");
  assert.equal(backToUsersHref("//evil.example"), "/admin/users");
  assert.equal(backToUsersHref("/admin/usersevil"), "/admin/users");
  assert.equal(backToUsersHref("/admin/programme-completion"), "/admin/users");
});

test("the user view links back to engine activity only for an engine-activity URL", () => {
  assert.deepEqual(userBackLink("/admin/engine-activity?rule=r1"), {
    href: "/admin/engine-activity?rule=r1",
    label: "Engine activity",
  });
  assert.deepEqual(userBackLink("/admin/users?q=ada"), { href: "/admin/users?q=ada", label: "Users" });
  assert.deepEqual(userBackLink("https://evil.example/admin/engine-activity"), {
    href: "/admin/users",
    label: "Users",
  });
  assert.deepEqual(userBackLink("/admin/engine-activityevil"), { href: "/admin/users", label: "Users" });
});

test("a date-time reads as day, 24-hour time and UTC", () => {
  assert.equal(formatDateTime("2026-10-14T08:05:00.000Z"), "14 Oct 2026, 08:05 UTC");
});

test("engine-activity URLs keep only the filters that are set", () => {
  assert.deepEqual(parseEngineActivitySearch({ rule: " r1 ", event: ["task.completed", "x"] }), {
    ruleId: "r1",
    eventName: "task.completed",
  });
  assert.deepEqual(parseEngineActivitySearch({ rule: "" }), { ruleId: null, eventName: null });
  assert.equal(engineActivityHref({}), "/admin/engine-activity");
  assert.equal(
    engineActivityHref({ ruleId: "r 1", eventName: "task.completed" }),
    "/admin/engine-activity?rule=r+1&event=task.completed",
  );
});
