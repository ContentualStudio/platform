import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ProgrammeTask, ProgrammeTaskProgress } from "../schemas/programme-task.schema";
import {
  buildTaskTimeline,
  dayTypeLabel,
  defaultTimelineDay,
  outcomesByTask,
  taskDayState,
} from "./daily-tasks";

function task(dayNumber: number, dayType: ProgrammeTask["dayType"] = "push"): ProgrammeTask {
  return {
    id: `task-${dayNumber}`,
    title: `Task ${dayNumber}`,
    contentType: "reel",
    weekIndex: 1,
    dayIndex: dayNumber,
    dayNumber,
    dayType,
  };
}

function logged(
  dayNumber: number,
  outcome: ProgrammeTaskProgress["outcome"],
  recordedAt = "2026-10-01T10:00:00.000Z",
): ProgrammeTaskProgress {
  return { taskId: `task-${dayNumber}`, outcome, localDate: "2026-10-01", recordedAt };
}

test("a day is green only when its task was logged as completed", () => {
  assert.equal(taskDayState(2, 5, "completed"), "completed");
  assert.equal(taskDayState(2, 5, "skipped"), "skipped");
  assert.equal(taskDayState(2, 5, undefined), "missed");
  assert.equal(taskDayState(5, 5, undefined), "today");
  assert.equal(taskDayState(5, 5, "completed"), "completed");
  assert.equal(taskDayState(6, 5, undefined), "upcoming");
  // Before Day 1 nothing is today or missed.
  assert.equal(taskDayState(1, 0, undefined), "upcoming");
});

test("a later log replaces an earlier one for the same task", () => {
  const outcomes = outcomesByTask([
    logged(1, "skipped", "2026-10-01T09:00:00.000Z"),
    logged(1, "completed", "2026-10-01T18:00:00.000Z"),
  ]);

  assert.equal(outcomes.get("task-1"), "completed");
});

test("the timeline has one entry per task day, in order, with its state", () => {
  const timeline = buildTaskTimeline(
    [task(3), task(1), task(2), { ...task(2), id: "task-2b", orderWithinDay: 2 }],
    [logged(1, "completed")],
    3,
  );

  assert.deepEqual(
    timeline.map((day) => [day.dayNumber, day.task.id, day.state]),
    [
      [1, "task-1", "completed"],
      [2, "task-2", "missed"],
      [3, "task-3", "today"],
    ],
  );
});

test("the timeline opens on today, else the next day to do, else the first", () => {
  assert.equal(defaultTimelineDay(buildTaskTimeline([task(1), task(2)], [], 2)), 2);
  assert.equal(defaultTimelineDay(buildTaskTimeline([task(1), task(2)], [logged(1, "completed")], 0)), 2);
  assert.equal(
    defaultTimelineDay(buildTaskTimeline([task(1)], [logged(1, "completed")], 9)),
    1,
  );
  assert.equal(defaultTimelineDay([]), null);
});

test("the strip names the kind of day, and a day without a task is rest", () => {
  assert.equal(dayTypeLabel(task(1, "protect")), "Protect");
  assert.equal(dayTypeLabel(task(1, "recharge")), "Recharge");
  assert.equal(dayTypeLabel(task(1, null)), "Task");
  assert.equal(dayTypeLabel(undefined), "Rest");
});
