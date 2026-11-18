import assert from "node:assert/strict";
import test from "node:test";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import { contentSyncHooks } from "./hooks";
import { projectDocument } from "./mappings";

function ruleDoc(overrides: Record<string, unknown> = {}) {
  return {
    _status: "published" as const,
    active: true,
    conditions: [],
    dedupeScope: dedupeScopeTokens.oncePerUser,
    description: null,
    effectType: effectTypeTokens.inAppMessage,
    id: 4,
    key: "welcome-nudge",
    message: "Nice work",
    name: "Welcome nudge",
    triggerEvent: eventNameTokens.taskCompleted,
    updatedAt: "2026-07-21T09:00:00.000Z",
    ...overrides,
  };
}

test("projects a programme with stable source and relationship ids", () => {
  const projection = projectDocument("programmes", {
    _status: "published",
    access: "locked",
    ctaText: "Start now",
    description: "A focused programme.",
    difficulty: "medium",
    durationDays: 21,
    expectations: { root: { children: [{ text: "Show up" }] } },
    experienceLevel: "beginner",
    founderVideoUrl: "https://vimeo.com/123",
    id: 42,
    insightMoments: [
      { triggerType: "day", triggerCondition: "7", copy: { root: {} } },
    ],
    lessons: [{ id: 9 }, 10, { id: "11" }],
    milestones: [{ name: "First post", triggerDay: 3, copy: { root: {} } }],
    slug: "focus",
    title: "Focus",
    track: "starter",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.deepEqual(projection, {
    collection: "programmes",
    columns: {
      ctaText: "text",
      description: "text",
      access: "text",
      difficulty: "text",
      durationDays: "integer",
      expectations: "jsonb",
      experienceLevel: "text",
      founderVideoUrl: "text",
      insightMoments: "jsonb",
      lessonIds: "text[]",
      milestones: "jsonb",
      minimumTier: "text",
      slug: "text",
      title: "text",
      track: "text",
    },
    publishedAt: "2026-07-20T10:00:00.000Z",
    sourceDocumentId: "42",
    sourceUpdatedAt: "2026-07-20T10:00:00.000Z",
    table: "programme",
    values: {
      ctaText: "Start now",
      description: "A focused programme.",
      access: "locked",
      difficulty: "medium",
      durationDays: 21,
      expectations: { root: { children: [{ text: "Show up" }] } },
      experienceLevel: "beginner",
      founderVideoUrl: "https://vimeo.com/123",
      insightMoments: [
        { triggerType: "day", triggerCondition: "7", copy: { root: {} } },
      ],
      // Relationship ids are normalised to text so the mirror column type is
      // stable whichever shape Payload returns.
      lessonIds: ["9", "10", "11"],
      milestones: [{ name: "First post", triggerDay: 3, copy: { root: {} } }],
      // Unset on a document published before the gate existed: open.
      minimumTier: "free",
      slug: "focus",
      title: "Focus",
      track: "starter",
    },
  });
});

test("projects a lesson's ordered attachment ids", () => {
  const projection = projectDocument("lessons", {
    _status: "published",
    attachments: [{ id: 4 }, 8, { id: "9" }],
    body: null,
    id: 7,
    slug: "lesson-7",
    summary: null,
    title: "Lesson",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.deepEqual(projection.values, {
    attachmentsIds: ["4", "8", "9"],
    body: null,
    minimumTier: "free",
    slug: "lesson-7",
    summary: null,
    title: "Lesson",
    lessonType: null,
    skillLevel: null,
    contentType: null,
    platforms: [],
    programmeRelevance: [],
    programmeDayStart: null,
    programmeDayEnd: null,
    vimeoVideoId: null,
    templateMediaId: null,
    templateUrl: null,
  });
});

test("projects a tagged lesson with every new column kind", () => {
  const projection = projectDocument("lessons", {
    _status: "published",
    attachments: [],
    body: { root: {} },
    contentType: "video",
    id: 7,
    lessonType: "video",
    minimumTier: "creator",
    platforms: ["instagram", "youtube"],
    programmeDayEnd: 7,
    programmeDayStart: 1,
    programmeRelevance: [{ id: 3 }, 4],
    skillLevel: "beginner",
    slug: "lesson-7",
    summary: "A lesson.",
    templateFile: { id: "m1", url: "https://cdn.example/t.pdf" },
    title: "Lesson",
    updatedAt: "2026-07-20T10:00:00.000Z",
    vimeoVideoId: "123",
  });

  assert.deepEqual(projection.columns, {
    attachmentsIds: "text[]",
    body: "jsonb",
    contentType: "text",
    lessonType: "text",
    minimumTier: "text",
    platforms: "text[]",
    programmeDayEnd: "integer",
    programmeDayStart: "integer",
    programmeRelevance: "text[]",
    skillLevel: "text",
    slug: "text",
    summary: "text",
    templateMediaId: "text",
    templateUrl: "text",
    title: "text",
    vimeoVideoId: "text",
  });
  assert.deepEqual(projection.values, {
    attachmentsIds: [],
    body: { root: {} },
    contentType: "video",
    lessonType: "video",
    minimumTier: "creator",
    platforms: ["instagram", "youtube"],
    programmeDayEnd: 7,
    programmeDayStart: 1,
    programmeRelevance: ["3", "4"],
    skillLevel: "beginner",
    slug: "lesson-7",
    summary: "A lesson.",
    // Lesson sync populates the media URL alongside its stable id.
    templateMediaId: "m1",
    templateUrl: "https://cdn.example/t.pdf",
    title: "Lesson",
    vimeoVideoId: "123",
  });
});

test("projects a bare template relationship id and a missing one as null", () => {
  const bare = projectDocument("lessons", {
    _status: "published",
    id: 8,
    slug: "lesson-8",
    templateFile: "media-1",
    title: "Lesson 8",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.equal(bare.values.templateMediaId, "media-1");

  const missing = projectDocument("lessons", {
    _status: "published",
    id: 9,
    slug: "lesson-9",
    title: "Lesson 9",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.equal(missing.values.templateMediaId, null);
});

test("projects modules and tasks with authored schedule order", () => {
  const moduleProjection = projectDocument("modules", {
    _status: "published",
    id: 12,
    lessons: [{ id: 5 }, 6],
    order: 2,
    programme: { id: 42 },
    slug: "module-2",
    title: "Publish",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.equal(moduleProjection.table, "programme_modules");
  assert.deepEqual(moduleProjection.values, {
    lessonIds: ["5", "6"],
    moduleOrder: 2,
    programmeId: "42",
    slug: "module-2",
    title: "Publish",
  });

  const taskProjection = projectDocument("tasks", {
    contentType: "video",
    _status: "published",
    dayNumber: 9,
    dayType: "push",
    id: 99,
    instructions: { root: { children: [{ text: "Post" }] } },
    lesson: { id: 6 },
    module: 12,
    orderWithinDay: 2,
    outputDescription: { root: { children: [{ text: "A post" }] } },
    pausePrompt: { root: { children: [{ text: "Pause" }] } },
    platform: "instagram",
    cameraRequired: true,
    objective: "Show the workspace",
    openingLine: "Here is where it all happens.",
    whyItMatters: { root: { children: [{ text: "Trust" }] } },
    postNumber: 4,
    programme: 42,
    publishSlot: true,
    slug: "task-99",
    timeEstimateMinutes: 45,
    title: "Publish a post",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.deepEqual(taskProjection.columns, {
    contentType: "text",
    dayNumber: "integer",
    dayType: "text",
    instructions: "jsonb",
    lessonId: "text",
    moduleId: "text",
    orderWithinDay: "integer",
    outputDescription: "jsonb",
    pausePrompt: "jsonb",
    platform: "text",
    cameraRequired: "boolean",
    objective: "text",
    openingLine: "text",
    whyItMatters: "jsonb",
    postNumber: "integer",
    programmeId: "text",
    publishSlot: "boolean",
    slug: "text",
    timeEstimateMinutes: "integer",
    title: "text",
  });
  assert.deepEqual(taskProjection.values, {
    contentType: "video",
    dayNumber: 9,
    dayType: "push",
    instructions: { root: { children: [{ text: "Post" }] } },
    lessonId: "6",
    moduleId: "12",
    orderWithinDay: 2,
    outputDescription: { root: { children: [{ text: "A post" }] } },
    pausePrompt: { root: { children: [{ text: "Pause" }] } },
    platform: "instagram",
    cameraRequired: true,
    objective: "Show the workspace",
    openingLine: "Here is where it all happens.",
    whyItMatters: { root: { children: [{ text: "Trust" }] } },
    postNumber: 4,
    programmeId: "42",
    publishSlot: true,
    slug: "task-99",
    timeEstimateMinutes: 45,
    title: "Publish a post",
  });
});

test("projects an unset optional field as null rather than an empty string", () => {
  const projection = projectDocument("tasks", {
    _status: "published",
    dayNumber: 1,
    dayType: "protect",
    id: 3,
    instructions: null,
    lesson: null,
    module: null,
    orderWithinDay: 1,
    outputDescription: null,
    pausePrompt: null,
    postNumber: null,
    programme: 42,
    publishSlot: false,
    slug: "warm-up",
    title: "Warm up",
    timeEstimateMinutes: 30,
    updatedAt: "2026-07-20T10:00:00.000Z",
  });

  assert.deepEqual(projection.values, {
    contentType: null,
    dayNumber: 1,
    dayType: "protect",
    instructions: null,
    lessonId: null,
    moduleId: null,
    orderWithinDay: 1,
    outputDescription: null,
    pausePrompt: null,
    platform: null,
    cameraRequired: false,
    objective: null,
    openingLine: null,
    whyItMatters: null,
    postNumber: null,
    programmeId: "42",
    publishSlot: false,
    slug: "warm-up",
    title: "Warm up",
    timeEstimateMinutes: 30,
  });
});

test("projects both engine catalogues with a real boolean active flag", () => {
  const badge = projectDocument("engine-badges", {
    _status: "published",
    active: false,
    description: "Seven days in a row.",
    id: 8,
    key: "streak-7",
    name: "Seven day streak",
    updatedAt: "2026-07-21T09:00:00.000Z",
  });

  assert.deepEqual(badge, {
    collection: "engine-badges",
    columns: {
      active: "boolean",
      description: "text",
      key: "text",
      name: "text",
    },
    publishedAt: "2026-07-21T09:00:00.000Z",
    sourceDocumentId: "8",
    sourceUpdatedAt: "2026-07-21T09:00:00.000Z",
    table: "engine_badges",
    values: {
      // A deactivated definition must arrive as false, not null and not "false":
      // runtime consumers distinguish deactivated from unknown.
      active: false,
      description: "Seven days in a row.",
      key: "streak-7",
      name: "Seven day streak",
    },
  });

  const callType = projectDocument("engine-call-types", {
    _status: "published",
    active: true,
    description: null,
    id: 3,
    key: "strategy",
    name: "Strategy call",
    updatedAt: "2026-07-21T09:00:00.000Z",
  });

  assert.equal(callType.table, "engine_call_types");
  assert.deepEqual(callType.values, {
    active: true,
    description: null,
    key: "strategy",
    name: "Strategy call",
  });
});

test("treats a missing catalogue active flag as inactive", () => {
  const projection = projectDocument("engine-badges", {
    _status: "published",
    id: 9,
    key: "founder",
    name: "Founder",
    updatedAt: "2026-07-21T09:00:00.000Z",
  });

  assert.equal(projection.values.active, false);
});

test("projects an engine rule in evaluator shape", () => {
  const projection = projectDocument(
    "engine-rules",
    ruleDoc({
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "contentType",
          operator: operatorTokens.eq,
          value: "video",
          // Payload's array row id is an authoring artefact, not rule data.
          id: "row-1",
        },
        {
          source: conditionSourceTokens.user,
          field: "programmes_completed",
          operator: operatorTokens.gte,
          value: 2,
        },
      ],
      description: "Nudge after the first video.",
    }),
  );

  assert.deepEqual(projection, {
    collection: "engine-rules",
    columns: {
      key: "text",
      name: "text",
      description: "text",
      triggerEvent: "text",
      conditions: "jsonb",
      effectType: "text",
      effectParams: "jsonb",
      dedupeScope: "text",
      priority: "integer",
      active: "boolean",
    },
    publishedAt: "2026-07-21T09:00:00.000Z",
    sourceDocumentId: "4",
    sourceUpdatedAt: "2026-07-21T09:00:00.000Z",
    table: "engine_rules",
    values: {
      key: "welcome-nudge",
      name: "Welcome nudge",
      description: "Nudge after the first video.",
      triggerEvent: eventNameTokens.taskCompleted,
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "contentType",
          operator: operatorTokens.eq,
          value: "video",
        },
        {
          source: conditionSourceTokens.user,
          field: "programmes_completed",
          operator: operatorTokens.gte,
          value: 2,
        },
      ],
      effectType: effectTypeTokens.inAppMessage,
      effectParams: { message: "Nice work" },
      dedupeScope: dedupeScopeTokens.oncePerUser,
      priority: 100,
      active: true,
    },
  });
});

test("projects every supported effect's parameters with normalized ids", () => {
  const effectParamsOf = (overrides: Record<string, unknown>) =>
    projectDocument("engine-rules", ruleDoc({ message: null, ...overrides }))
      .values.effectParams;

  assert.deepEqual(
    effectParamsOf({
      effectType: effectTypeTokens.suggestProgramme,
      programme: 12,
    }),
    { programmeSourceId: "12" },
  );
  assert.deepEqual(
    effectParamsOf({
      effectType: effectTypeTokens.unlockProgramme,
      // A populated relationship normalizes to the same id as a raw one.
      programme: { id: 12 },
    }),
    { programmeSourceId: "12" },
  );
  assert.deepEqual(
    effectParamsOf({ effectType: effectTypeTokens.awardBadge, badge: 7 }),
    { badgeSourceId: "7" },
  );
  assert.deepEqual(
    effectParamsOf({ effectType: effectTypeTokens.promptCall, callType: "3" }),
    { callTypeSourceId: "3" },
  );
  assert.deepEqual(
    effectParamsOf({
      effectType: effectTypeTokens.inAppMessage,
      message: "  Keep going  ",
    }),
    { message: "Keep going" },
  );
});

test("mirrors a published inactive rule rather than dropping it", () => {
  assert.equal(
    projectDocument("engine-rules", ruleDoc({ active: false })).values.active,
    false,
  );
});

test("refuses to project a published rule that does not validate", () => {
  // Publication is gated, so this can only happen through drift. Failing loudly
  // keeps a malformed rule out of the mirror and puts the error in front of an
  // operator.
  assert.throws(
    () =>
      projectDocument(
        "engine-rules",
        ruleDoc({ effectType: effectTypeTokens.grantCall }),
      ),
    /grant_call is not available in v1/,
  );
});

test("does not queue a draft-only edit but reconciles a published transition", async () => {
  const queued: unknown[] = [];
  const hooks = contentSyncHooks("lessons");
  const afterChange = hooks.afterChange?.[0];

  assert.ok(afterChange);

  await afterChange({
    doc: { _status: "draft", id: 7 },
    previousDoc: { _status: "draft", id: 7 },
    req: {
      payload: { jobs: { queue: async (job: unknown) => queued.push(job) } },
    },
  } as never);
  assert.equal(queued.length, 0);

  await afterChange({
    doc: { _status: "published", id: 7 },
    previousDoc: { _status: "draft", id: 7 },
    req: {
      payload: { jobs: { queue: async (job: unknown) => queued.push(job) } },
    },
  } as never);

  assert.deepEqual(queued, [
    {
      input: { collection: "lessons", sourceDocumentId: "7" },
      queue: "content-mirror",
      task: "mirror-document",
    },
  ]);
});

test("template URL projection rejects executable media URLs", () => {
  const lesson = projectDocument("lessons", {
    id: 99,
    updatedAt: "2026-10-19T00:00:00.000Z",
    templateFile: { id: 3, url: "javascript:alert(1)" },
  });
  assert.equal(lesson.values.templateUrl, null);
});

test("mirrors authored suggestion priority without changing its ordering", () => {
  assert.equal(
    projectDocument("engine-rules", ruleDoc({ priority: 7 })).values.priority,
    7,
  );
});

test("refuses malformed priority rather than silently changing the winner", () => {
  for (const priority of [-1, 0.5, "7", 2147483648]) {
    assert.throws(
      () => projectDocument("engine-rules", ruleDoc({ priority })),
      /Priority/,
    );
  }
});
