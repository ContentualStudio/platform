import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  programmeTaskProgressSchema,
  programmeTaskSchema,
} from "../schemas/programme-task.schema";
import {
  checklistStepsFromTask,
  dailyTaskEmptyState,
  richTextText,
} from "./programme-tasks";

const baseTask = {
  id: "task-1",
  title: "Film a talking head",
  contentType: "video",
  weekIndex: 1,
  dayIndex: 1,
};

function lexical(...lines: string[]) {
  return {
    root: {
      children: lines.map((text) => ({ type: "paragraph", children: [{ text }] })),
    },
  };
}

test("checklist steps come from the authored instructions", () => {
  const task = programmeTaskSchema.parse({
    ...baseTask,
    instructions: lexical("Set up the shot", "Record three takes"),
  });

  assert.deepEqual(checklistStepsFromTask(task), [
    "Set up the shot",
    "Record three takes",
  ]);
});

test("a task with no authored instructions falls back to its title", () => {
  const task = programmeTaskSchema.parse(baseTask);

  assert.deepEqual(checklistStepsFromTask(task), ["Film a talking head"]);
});

test("authored rich text reads back as one paragraph, and absent fields as nothing", () => {
  assert.equal(richTextText(lexical("Pause", "and reflect")), "Pause and reflect");
  assert.equal(richTextText(undefined), "");
  assert.equal(richTextText(null), "");
});

test("the card's optional authored fields survive a parse", () => {
  const task = programmeTaskSchema.parse({
    ...baseTask,
    dayType: "protect",
    timeEstimateMinutes: 20,
    publishSlot: true,
    postNumber: 3,
    lessonId: "lesson-7",
  });

  assert.equal(task.dayType, "protect");
  assert.equal(task.timeEstimateMinutes, 20);
  assert.equal(task.publishSlot, true);
  assert.equal(task.postNumber, 3);
  assert.equal(task.lessonId, "lesson-7");
});

test("the five late-added authored fields survive a parse", () => {
  const task = programmeTaskSchema.parse({
    ...baseTask,
    platform: "tiktok",
    cameraRequired: true,
    objective: "Show the workspace",
    openingLine: "Here is where it all happens.",
    whyItMatters: lexical("People trust what they can see"),
  });

  assert.equal(task.platform, "tiktok");
  assert.equal(task.cameraRequired, true);
  assert.equal(task.objective, "Show the workspace");
  assert.equal(task.openingLine, "Here is where it all happens.");
  assert.equal(
    richTextText(task.whyItMatters),
    "People trust what they can see",
  );
});

test("an unknown platform is rejected rather than rendered as a chip", () => {
  assert.equal(
    programmeTaskSchema.safeParse({ ...baseTask, platform: "myspace" }).success,
    false,
  );
});

test("an unknown day type is rejected rather than rendered as a badge", () => {
  assert.equal(
    programmeTaskSchema.safeParse({ ...baseTask, dayType: "sprint" }).success,
    false,
  );
});

test("recorded outcomes parse into the shape the card opens from", () => {
  const record = programmeTaskProgressSchema.parse({
    taskId: "task-1",
    outcome: "skipped",
    localDate: "2026-09-07",
    recordedAt: "2026-09-07T08:15:00.000Z",
  });

  assert.equal(record.outcome, "skipped");
  assert.equal(
    programmeTaskProgressSchema.safeParse({
      taskId: "task-1",
      outcome: "deferred",
      localDate: "2026-09-07",
      recordedAt: "2026-09-07T08:15:00.000Z",
    }).success,
    false,
  );
});

test("a gap in an authored programme reads as a rest day, not as missing content", () => {
  const restDay = dailyTaskEmptyState("active", true);

  assert.equal(restDay.title, "Rest day");
  assert.match(restDay.body, /nothing to do today/i);
  assert.match(restDay.body, /no streak lost/i);
});

test("an empty day further along the programme says nothing is scheduled", () => {
  assert.equal(dailyTaskEmptyState("upcoming", true).title, "Nothing scheduled");
});

test("a programme with no authored tasks says the content is not there yet", () => {
  const noContent = dailyTaskEmptyState("active", false);

  assert.equal(noContent.title, "No task scheduled");
  assert.match(noContent.body, /once programme content is available/i);
});
