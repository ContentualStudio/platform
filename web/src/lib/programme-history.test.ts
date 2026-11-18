import * as assert from "node:assert/strict";
import { test } from "node:test";
import { programmeHistorySchema } from "../schemas/programme-history.schema";
import {
  RETIRED_PROGRAMME_TITLE,
  formatHistoryDate,
  historyStatusLabel,
  historyTabs,
  historyTitle,
  initialHistoryTab,
} from "./programme-history";

const entry = {
  enrolmentId: "e1",
  slug: "first-take",
  title: "First Take",
  track: "starter",
  status: "completed" as const,
  startedAt: "2026-09-01T08:00:00.000Z",
  endedAt: "2026-09-22T08:00:00.000Z",
  durationDays: 21,
  completedDays: 14,
  completionPercent: 67,
};

test("a history response parses into the shape the screen renders", () => {
  const history = programmeHistorySchema.parse({ inProgress: [], past: [entry] });

  assert.equal(history.past[0]?.completionPercent, 67);
});

test("a programme gone from the catalogue gets a neutral title", () => {
  assert.equal(historyTitle({ ...entry, title: null }), RETIRED_PROGRAMME_TITLE);
  assert.equal(historyTitle(entry), "First Take");
});

test("each status has its own label", () => {
  assert.equal(historyStatusLabel({ ...entry, status: "active" }), "In progress");
  assert.equal(historyStatusLabel(entry), "Completed");
  assert.equal(historyStatusLabel({ ...entry, status: "abandoned" }), "Ended early");
  assert.equal(historyStatusLabel({ ...entry, title: null }), "Unavailable");
});

test("a programme gone from the catalogue moves to Unavailable, whatever its status", () => {
  const running = { ...entry, enrolmentId: "run", status: "active" as const, endedAt: null };
  const retired = { ...entry, enrolmentId: "gone", title: null };
  const retiredRunning = { ...running, enrolmentId: "gone-run", title: null };

  const tabs = historyTabs({ inProgress: [running, retiredRunning], past: [entry, retired] });

  assert.deepEqual(tabs.progress.map((row) => row.enrolmentId), ["run"]);
  assert.deepEqual(tabs.past.map((row) => row.enrolmentId), ["e1"]);
  assert.deepEqual(tabs.unavailable.map((row) => row.enrolmentId), ["gone-run", "gone"]);
});

test("history opens on the first tab that has something in it", () => {
  assert.equal(initialHistoryTab(historyTabs({ inProgress: [], past: [entry] })), "past");
  assert.equal(
    initialHistoryTab(historyTabs({ inProgress: [], past: [{ ...entry, title: null }] })),
    "unavailable",
  );
  assert.equal(initialHistoryTab(historyTabs({ inProgress: [], past: [] })), "progress");
});

test("dates render in the user's timezone", () => {
  // 23:30 UTC on 1 Sep is already 2 Sep in Lagos (UTC+1).
  assert.ok(formatHistoryDate("2026-09-01T23:30:00.000Z", "Africa/Lagos").startsWith("2 "));
  assert.ok(formatHistoryDate("2026-09-01T23:30:00.000Z", null).startsWith("1 "));
});

test("an unrecognised timezone falls back to UTC instead of throwing", () => {
  assert.ok(formatHistoryDate("2026-09-01T23:30:00.000Z", "Nowhere/Imaginary").startsWith("1 "));
});

test("an unknown status is shown as in progress rather than failing the page", () => {
  const history = programmeHistorySchema.parse({
    inProgress: [{ ...entry, status: "paused", endedAt: null }],
    past: [],
  });

  assert.equal(history.inProgress[0]?.status, "active");
  assert.equal(historyStatusLabel(history.inProgress[0]!), "In progress");
});
