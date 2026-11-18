import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarStripAroundToday,
  calendarWindow,
  deriveChallengeProgress,
} from "./challenge-progress";

// Day 1 anchored to midnight 01 Oct 2025 in London (BST, UTC+1).
const day1London = "2025-09-30T23:00:00.000Z";

test("returns null when the programme has no Day 1 anchor", () => {
  assert.equal(
    deriveChallengeProgress({
      day1ScheduledFor: null,
      durationDays: 15,
      timezone: "Europe/London",
    }),
    null,
  );
});

test("returns null when the duration is missing or nonsensical", () => {
  const base = {
    day1ScheduledFor: day1London,
    timezone: "Europe/London",
  };

  assert.equal(deriveChallengeProgress({ ...base, durationDays: null }), null);
  assert.equal(deriveChallengeProgress({ ...base, durationDays: 0 }), null);
});

test("day 1 is the current day once its anchor arrives", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-10-01T08:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 1);
  assert.equal(progress?.hasStarted, true);
  assert.equal(progress?.progressPercent, 7);
});

test("the strip spans the full duration and labels real calendar dates", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-10-01T08:00:00.000Z"),
  });

  assert.equal(progress?.days.length, 15);
  assert.deepEqual(progress?.days[0], {
    dayNumber: 1,
    date: "2025-10-01",
    weekdayLabel: "Wed",
    dayOfMonth: "01",
    state: "active",
  });
  assert.equal(progress?.days[14].date, "2025-10-15");
  assert.equal(progress?.days[14].dayOfMonth, "15");
});

test("the dashboard calendar shows one week of a longer programme", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 30,
    timezone: "Europe/London",
    now: new Date("2025-10-02T08:00:00.000Z"),
  });

  const visible = calendarWindow(progress?.days ?? [], progress?.currentDay ?? 0);

  assert.equal(progress?.days.length, 30);
  assert.equal(visible.length, 7);
  assert.equal(visible[0]?.dayOfMonth, "01");
  assert.equal(visible[0]?.weekdayLabel, "Wed");
  assert.equal(visible[1]?.state, "active");
  assert.equal(visible[6]?.dayOfMonth, "07");
});

test("the calendar window advances by programme week and fills the last week", () => {
  const weekThree = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 30,
    timezone: "Europe/London",
    now: new Date("2025-10-16T08:00:00.000Z"),
  });
  const lastDay = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 30,
    timezone: "Europe/London",
    now: new Date("2025-10-30T08:00:00.000Z"),
  });
  const notStarted = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 30,
    timezone: "Europe/London",
    now: new Date("2025-09-30T20:00:00.000Z"),
  });

  const weekThreeDays = calendarWindow(
    weekThree?.days ?? [],
    weekThree?.currentDay ?? 0,
  );
  const lastWeek = calendarWindow(lastDay?.days ?? [], lastDay?.currentDay ?? 0);
  const firstWeek = calendarWindow(
    notStarted?.days ?? [],
    notStarted?.currentDay ?? 0,
  );

  assert.deepEqual(
    weekThreeDays.map((day) => day.dayNumber),
    [15, 16, 17, 18, 19, 20, 21],
  );
  assert.deepEqual(
    lastWeek.map((day) => day.dayNumber),
    [24, 25, 26, 27, 28, 29, 30],
  );
  assert.deepEqual(
    firstWeek.map((day) => day.dayNumber),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("elapsed days never claim completion — no source records it yet", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-10-09T08:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 9);
  assert.deepEqual(
    progress?.days.map((day) => day.state),
    [
      ...Array<string>(8).fill("elapsed"),
      "active",
      ...Array<string>(6).fill("upcoming"),
    ],
  );
});

test("a programme begun but not yet reached reports day 0 and no progress", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-09-30T20:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 0);
  assert.equal(progress?.hasStarted, false);
  assert.equal(progress?.progressPercent, 0);
  assert.ok(progress?.days.every((day) => day.state === "upcoming"));
});

test("running past the final day clamps to the duration", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-11-20T08:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 15);
  assert.equal(progress?.progressPercent, 100);
  assert.equal(progress?.days[14].state, "active");
});

// 03:00 UTC on 02 Oct is still 01 Oct (day 1) in Los Angeles, but already
// day 2 in Sydney — a UTC-only diff would roll both over together.
test("the day rolls over on the user's local midnight, not UTC's", () => {
  const now = new Date("2025-10-02T03:00:00.000Z");

  const losAngeles = deriveChallengeProgress({
    day1ScheduledFor: "2025-10-01T07:00:00.000Z",
    durationDays: 15,
    timezone: "America/Los_Angeles",
    now,
  });

  const sydney = deriveChallengeProgress({
    day1ScheduledFor: "2025-09-30T14:00:00.000Z",
    durationDays: 15,
    timezone: "Australia/Sydney",
    now,
  });

  assert.equal(losAngeles?.currentDay, 1);
  assert.equal(sydney?.currentDay, 2);
});

test("day arithmetic survives a DST transition", () => {
  // Britain leaves BST on 26 Oct 2025; day 1 is anchored before the shift.
  const progress = deriveChallengeProgress({
    day1ScheduledFor: "2025-10-19T23:00:00.000Z",
    durationDays: 15,
    timezone: "Europe/London",
    now: new Date("2025-10-28T12:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 9);
  assert.equal(progress?.days[8].date, "2025-10-28");
});

test("the dashboard strip always ends on today and highlights the current date", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: day1London,
    durationDays: 30,
    timezone: "Europe/London",
    now: new Date("2025-09-30T20:00:00.000Z"),
  });

  const strip = calendarStripAroundToday(
    progress?.days ?? [],
    "Europe/London",
    new Date("2025-09-30T20:00:00.000Z"),
  );

  assert.equal(strip.length, 7);
  assert.equal(strip.at(-1)?.date, "2025-09-30");
  assert.equal(strip.at(-1)?.dayOfMonth, "30");
  assert.equal(strip.at(-1)?.isProgrammeDay, false);
  assert.equal(strip.at(-1)?.state, "active");
});

test("an unusable timezone falls back to UTC rather than throwing", () => {
  const progress = deriveChallengeProgress({
    day1ScheduledFor: "2025-10-01T00:00:00.000Z",
    durationDays: 15,
    timezone: "Not/AZone",
    now: new Date("2025-10-03T12:00:00.000Z"),
  });

  assert.equal(progress?.currentDay, 3);
});
