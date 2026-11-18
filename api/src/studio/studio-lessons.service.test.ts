import * as assert from "node:assert/strict";
import { test } from "node:test";
import { freeEntitlements } from "../billing/entitlement.service";
import { StudioLessonsService } from "./studio-lessons.service";

function row(overrides: Record<string, unknown> = {}) {
  return {
    slug: "lesson-1",
    sourceDocumentId: "1",
    title: "Lesson",
    summary: "A lesson.",
    attachmentsIds: ["3"],
    body: { root: {} },
    minimumTier: "creator",
    lessonType: "video",
    skillLevel: "beginner",
    contentType: "video",
    platforms: ["instagram"],
    programmeRelevance: ["42"],
    programmeDayStart: 1,
    programmeDayEnd: 7,
    vimeoVideoId: "123",
    templateMediaId: "m1",
    templateUrl: "https://cdn.example/template.pdf",
    ...overrides,
  };
}

function service(rows: Record<string, unknown>[], queries: string[] = []) {
  const dataSource = {
    query: async (sql: string) => {
      queries.push(sql);
      return rows;
    },
  };
  return new StudioLessonsService(dataSource as never);
}

const creatorEntitlements = {
  ...freeEntitlements,
  tier: "creator" as const,
  paid: true,
};

test("tags stay visible on a locked card", async () => {
  const lessons = await service([row()]).listLessons(freeEntitlements);

  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].locked, true);
  assert.equal(lessons[0].lessonType, "video");
  assert.equal(lessons[0].skillLevel, "beginner");
  assert.equal(lessons[0].contentType, "video");
  assert.deepEqual(lessons[0].platforms, ["instagram"]);
  assert.deepEqual(lessons[0].programmeRelevance, ["42"]);
  assert.equal(lessons[0].programmeDayStart, 1);
  assert.equal(lessons[0].programmeDayEnd, 7);
});

test("the list orders newest first with a total tiebreak", async () => {
  const queries: string[] = [];
  await service([row()], queries).listLessons(freeEntitlements);

  assert.match(
    queries[0]?.replace(/\s+/g, " ") ?? "",
    /ORDER BY "publishedAt" DESC, "sourceDocumentId"/,
  );
});

test("body content is withheld when locked and returned when open", async () => {
  const locked = await service([row()]).findLesson(
    "lesson-1",
    freeEntitlements,
  );

  assert.equal(locked?.locked, true);
  assert.equal(locked?.body, null);
  assert.deepEqual(locked?.attachmentsIds, []);
  assert.equal(locked?.vimeoVideoId, null);
  assert.equal(locked?.templateMediaId, null);
  assert.equal(locked?.templateUrl, null);
  // Tags are listing data, not body content: still visible.
  assert.equal(locked?.lessonType, "video");

  const open = await service([row()]).findLesson(
    "lesson-1",
    creatorEntitlements,
  );

  assert.equal(open?.locked, false);
  assert.deepEqual(open?.body, { root: {} });
  assert.deepEqual(open?.attachmentsIds, ["3"]);
  assert.equal(open?.vimeoVideoId, "123");
  assert.equal(open?.templateMediaId, "m1");
  assert.equal(open?.templateUrl, "https://cdn.example/template.pdf");
});

test("free templates deliver their URL to free users; unknown slugs return no lesson", async () => {
  const lesson = await service([
    row({ minimumTier: "free", lessonType: "template" }),
  ]).findLesson("lesson-1", freeEntitlements);
  assert.equal(lesson?.templateUrl, "https://cdn.example/template.pdf");
  assert.equal(lesson?.locked, false);
  assert.equal(
    await service([]).findLesson("missing", freeEntitlements),
    undefined,
  );
});
