import * as assert from "node:assert/strict";
import { test } from "node:test";
import { findProgramme } from "./programme-content";
import {
  findProgrammeTask,
  programmeTaskContent,
  tasksForProgramme,
  tasksForWeek,
} from "./programme-task-content";

test("every programme key resolves via findProgramme", () => {
  for (const programmeId of Object.keys(programmeTaskContent)) {
    assert.ok(
      findProgramme(programmeId),
      `${programmeId} has no matching authored programme`,
    );
  }
});

test("task ids are unique within each programme", () => {
  for (const [programmeId, tasks] of Object.entries(programmeTaskContent)) {
    const ids = tasks.map((task) => task.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${programmeId} has duplicate task ids`,
    );
  }
});

test("weekIndex is contiguous from 1 with no gaps", () => {
  for (const [programmeId, tasks] of Object.entries(programmeTaskContent)) {
    const weeks = [...new Set(tasks.map((task) => task.weekIndex))].sort(
      (a, b) => a - b,
    );
    assert.deepEqual(
      weeks,
      Array.from({ length: weeks.length }, (_, index) => index + 1),
      `${programmeId} has a gap or non-contiguous week index`,
    );
  }
});

test("every week has at least one task", () => {
  for (const [programmeId, tasks] of Object.entries(programmeTaskContent)) {
    const maxWeek = Math.max(...tasks.map((task) => task.weekIndex));
    for (let week = 1; week <= maxWeek; week += 1) {
      assert.ok(
        tasksForWeek(programmeId, week).length > 0,
        `${programmeId} week ${week} has no tasks`,
      );
    }
  }
});

test("every task has a non-empty content type", () => {
  for (const tasks of Object.values(programmeTaskContent)) {
    for (const task of tasks) {
      assert.ok(task.contentType.trim().length > 0, `${task.id} has no contentType`);
    }
  }
});

test("tasksForProgramme and findProgrammeTask resolve by id", () => {
  const [firstTask] = tasksForProgramme("15-day-jumpstart");
  assert.ok(firstTask);
  assert.deepEqual(
    findProgrammeTask("15-day-jumpstart", firstTask.id),
    firstTask,
  );
  assert.equal(findProgrammeTask("15-day-jumpstart", "unknown-task"), undefined);
  assert.deepEqual(tasksForProgramme("unknown-programme"), []);
});
