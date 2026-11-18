import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  upcomingTaskDaySchema,
  weekAheadSchema,
} from "../schemas/week-ahead.schema";

const day = {
  dayNumber: 4,
  taskId: "task-4",
  title: "Film one reel",
};

test("an upcoming day parses with only the fields the CMS authored", () => {
  const parsed = upcomingTaskDaySchema.parse(day);

  assert.deepEqual(parsed, day);
  assert.equal("dayType" in parsed, false);
  assert.equal("cameraRequired" in parsed, false);
});

test("the optional row fields survive a parse when present", () => {
  const parsed = upcomingTaskDaySchema.parse({
    ...day,
    contentType: "video",
    dayType: "push",
    cameraRequired: true,
    timeEstimateMinutes: 25,
  });

  assert.equal(parsed.dayType, "push");
  assert.equal(parsed.contentType, "video");
  assert.equal(parsed.cameraRequired, true);
  assert.equal(parsed.timeEstimateMinutes, 25);
});

test("an unknown day type is rejected rather than rendered as a badge", () => {
  assert.equal(
    upcomingTaskDaySchema.safeParse({ ...day, dayType: "sprint" }).success,
    false,
  );
});

test("the no-active-programme state parses as a state, not an error", () => {
  const parsed = weekAheadSchema.parse({
    hasActiveProgramme: false,
    programmeSlug: null,
    currentDay: 0,
    durationDays: 0,
    reachesProgrammeEnd: false,
    days: [],
  });

  assert.equal(parsed.hasActiveProgramme, false);
  assert.deepEqual(parsed.days, []);
});
