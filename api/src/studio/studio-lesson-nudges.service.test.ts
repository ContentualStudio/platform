import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { StudioLessonNudgesService } from "./studio-lesson-nudges.service";

test("no qualifying lesson or an already claimed category returns no nudge", async () => {
  const service = new StudioLessonNudgesService({
    query: async () => [],
  } as never);
  assert.equal(await service.claimForCompletedTask("user", "task"), null);
});
test("a claimed category returns only related lesson identifiers", async () => {
  const queries: unknown[][] = [];
  const service = new StudioLessonNudgesService({
    query: async (_sql: string, args: unknown[]) => {
      queries.push(args);
      return [{ category: "video", lessonIds: ["film-basics", "editing"] }];
    },
  } as never);
  assert.deepEqual(await service.claimForCompletedTask("user", "task"), {
    category: "video",
    lessonIds: ["film-basics", "editing"],
  });
  assert.deepEqual(queries, [["user", "task"]]);
});
