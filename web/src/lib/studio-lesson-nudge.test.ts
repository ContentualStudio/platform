import * as assert from "node:assert/strict";
import { test } from "node:test";
import { studioLessonNudgeHref, relatedLessonIds } from "./studio-lesson-nudge";

test("one related lesson opens its viewer directly", () => {
  const url = new URL(
    studioLessonNudgeHref({ category: "video", lessonIds: ["film & edit"] }),
    "https://example.test",
  );
  assert.equal(url.pathname, "/studio/browse");
  assert.equal(url.searchParams.get("lesson"), "film & edit");
});
test("multiple lessons retain the exact related set without auto-opening one", () => {
  const url = new URL(
    studioLessonNudgeHref({ category: "video", lessonIds: ["film", "edit"] }),
    "https://example.test",
  );
  assert.deepEqual(url.searchParams.getAll("related"), ["film", "edit"]);
  assert.equal(url.searchParams.get("lesson"), null);
});
test("related lesson parameters deduplicate and discard blank values", () => {
  assert.deepEqual(relatedLessonIds(["film", "", "film", "edit"]), [
    "film",
    "edit",
  ]);
  assert.deepEqual(relatedLessonIds(undefined), []);
});
