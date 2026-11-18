import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProgrammeContentRepository,
  type ProgrammeLessonMirrorRow,
  type ProgrammeModuleMirrorRow,
  type ProgrammeMirrorRow,
  type ProgrammeTaskMirrorRow,
} from "./programme-content.repository";

// The mirror carries every authored column on every row; a fixture only needs
// to say what the case under test is about, so the rest default to "the
// content team left it blank".
function taskRow(
  overrides: Partial<ProgrammeTaskMirrorRow>,
): ProgrammeTaskMirrorRow {
  return {
    cameraRequired: false,
    contentType: null,
    dayNumber: null,
    dayType: null,
    instructions: null,
    lessonId: null,
    moduleId: null,
    objective: null,
    openingLine: null,
    orderWithinDay: null,
    outputDescription: null,
    pausePrompt: null,
    platform: null,
    postNumber: null,
    programmeId: null,
    publishSlot: false,
    slug: "",
    sourceDocumentId: "",
    timeEstimateMinutes: null,
    title: "",
    whyItMatters: null,
    ...overrides,
  };
}

function dataSource(options: {
  programmeRows?: ProgrammeMirrorRow[];
  moduleRows?: ProgrammeModuleMirrorRow[];
  lessonRows?: ProgrammeLessonMirrorRow[];
  taskRows?: ProgrammeTaskMirrorRow[];
}) {
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];

  return {
    calls,
    query: async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM "programme_tasks"')) {
        return options.taskRows ?? [];
      }

      if (sql.includes('FROM "programme_modules"')) {
        return options.moduleRows ?? [];
      }

      if (sql.includes('FROM "studio_lessons"')) {
        return options.lessonRows ?? [];
      }

      return options.programmeRows ?? [];
    },
  };
}

test("reads published programme metadata from the typed mirror", async () => {
  const db = dataSource({
    programmeRows: [
      {
        access: "open",
        ctaText: "Begin the first take",
        description: "A three-week publishing sprint.",
        difficulty: "medium",
        durationDays: 21,
        expectations: { root: { children: [{ text: "Show up" }] } },
        experienceLevel: "beginner",
        founderVideoUrl: "https://vimeo.com/76979871",
        insightMoments: [{ triggerType: "day", copy: { root: {} } }],
        milestones: [{ name: "First post", triggerDay: 3, copy: { root: {} } }],
        slug: "first-take",
        sourceDocumentId: "programme-1",
        title: "First Take",
        track: "starter",
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const programme = await reader.findProgramme("first-take");

  assert.equal(programme?.id, "first-take");
  assert.equal(programme?.durationDays, 21);
  assert.equal(programme?.difficulty, 3);
  assert.equal(programme?.level, "Beginner");
  assert.deepEqual(programme?.founderVideo, {
    title: "A word from our founder",
    vimeoId: "76979871",
  });
  assert.deepEqual(programme?.expectations, {
    body: "Show up",
    title: "What to honestly expect",
  });
  assert.match(db.calls[0]?.sql ?? "", /WHERE \("slug" = \$1 OR "sourceDocumentId" = \$1\)/);
  assert.deepEqual(db.calls[0]?.parameters, ["first-take"]);
});

test("the identity read pairs the slug-keyed programme with its mirror document id", async () => {
  const db = dataSource({
    programmeRows: [
      {
        access: "open",
        ctaText: null,
        description: "",
        difficulty: null,
        durationDays: 21,
        expectations: null,
        experienceLevel: null,
        founderVideoUrl: null,
        insightMoments: [],
        milestones: [],
        slug: "first-take",
        sourceDocumentId: "programme-1",
        title: "First Take",
        track: null,
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const found = await reader.findProgrammeWithIdentity("first-take");

  assert.equal(found?.programme.id, "first-take");
  assert.equal(found?.sourceDocumentId, "programme-1");

  const empty = new ProgrammeContentRepository(
    dataSource({ programmeRows: [] }) as never,
  );
  assert.equal(await empty.findProgrammeWithIdentity("missing"), undefined);
});

test("the version identity read carries the snapshot's mirror document id", async () => {
  const snapshot = {
    programme: {
      id: "programme-1",
      key: "first-take",
      title: "First Take",
      description: "",
      access: "open",
      durationDays: 21,
      experienceLevel: null,
      difficulty: null,
      track: null,
      minimumTier: null,
      founderVideoUrl: null,
      expectations: null,
      ctaText: null,
      milestones: [],
      insightMoments: [],
    },
    modules: [],
    lessons: [],
    tasks: [],
  };
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  const db = {
    query: async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      return sql.includes('FROM "programme_content_versions"') &&
        parameters?.[0] === "first-take-v1"
        ? [
            {
              programmeVersionId: "first-take-v1",
              programmeKey: "first-take",
              sourceDocumentId: "programme-1",
              sourceUpdatedAt: "2026-09-01T08:00:00.000Z",
              contentHash: "abc",
              snapshot,
            },
          ]
        : [];
    },
  };
  const reader = new ProgrammeContentRepository(db as never);

  const found = await reader.findProgrammeVersionWithIdentity("first-take-v1");

  assert.equal(found?.programme.id, "first-take");
  assert.equal(found?.sourceDocumentId, "programme-1");
  assert.equal(
    await reader.findProgrammeVersionWithIdentity("missing"),
    undefined,
  );
});

test("returns ordered same-day tasks and retains schedule metadata", async () => {
  const db = dataSource({
    taskRows: [
      taskRow({
        contentType: "video",
        dayNumber: 2,
        dayType: "protect",
        instructions: { root: { children: [{ text: "Review" }] } },
        lessonId: "lesson-2",
        moduleId: "module-1",
        orderWithinDay: 2,
        outputDescription: { root: { children: [{ text: "Review" }] } },
        pausePrompt: null,
        postNumber: null,
        programmeId: "programme-1",
        publishSlot: false,
        slug: "day-2-review",
        sourceDocumentId: "task-2",
        timeEstimateMinutes: 30,
        title: "Review",
      }),
      taskRow({
        contentType: "photo",
        dayNumber: 2,
        dayType: "push",
        instructions: null,
        lessonId: "lesson-1",
        moduleId: "module-1",
        orderWithinDay: 1,
        outputDescription: null,
        pausePrompt: { root: { children: [{ text: "Pause" }] } },
        postNumber: 4,
        programmeId: "programme-1",
        publishSlot: true,
        slug: "day-2-post",
        sourceDocumentId: "task-1",
        timeEstimateMinutes: 45,
        title: "Post",
      }),
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const tasks = await reader.tasksForProgramme("programme-1");

  assert.deepEqual(
    tasks.map((task) => [task.id, task.dayIndex, task.orderWithinDay]),
    [
      ["day-2-post", 2, 1],
      ["day-2-review", 2, 2],
    ],
  );
  assert.equal(tasks[0]?.weekIndex, 1);
  assert.equal(tasks[0]?.dayType, "push");
  assert.equal(tasks[0]?.publishSlot, true);
  assert.equal(tasks[0]?.postNumber, 4);
  assert.equal(tasks[0]?.contentType, "photo");
  assert.equal(tasks[1]?.contentType, "video");
  assert.match(db.calls[0]?.sql ?? "", /programme_modules/);
  assert.match(db.calls[0]?.sql ?? "", /ORDER BY/);
});

test("returns ordered modules, lessons, and attachment ids from the mirrors", async () => {
  const db = dataSource({
    moduleRows: [
      {
        lessonIds: ["lesson-2", "lesson-1"],
        moduleOrder: 2,
        programmeId: "programme-1",
        slug: "module-2",
        sourceDocumentId: "module-2-source",
        title: "Publish",
      },
      {
        lessonIds: ["lesson-3"],
        moduleOrder: 1,
        programmeId: "programme-1",
        slug: "module-1",
        sourceDocumentId: "module-1-source",
        title: "Find your voice",
      },
    ],
    lessonRows: [
      {
        attachmentsIds: ["media-2", "media-1"],
        body: { root: { children: [{ text: "Second" }] } },
        slug: "lesson-2",
        sourceDocumentId: "lesson-2",
        summary: "Second summary",
        title: "Second lesson",
      },
      {
        attachmentsIds: ["media-3"],
        body: { root: { children: [{ text: "First" }] } },
        slug: "lesson-1",
        sourceDocumentId: "lesson-1",
        summary: "First summary",
        title: "First lesson",
      },
      {
        attachmentsIds: ["media-4"],
        body: null,
        slug: "lesson-3",
        sourceDocumentId: "lesson-3",
        summary: null,
        title: "Voice lesson",
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const modules = await reader.modulesForProgramme("programme-1");

  assert.deepEqual(
    modules.map((module) => [
      module.id,
      module.order,
      module.lessons.map((lesson) => [lesson.id, lesson.attachmentsIds]),
    ]),
    [
      ["module-1", 1, [["lesson-3", ["media-4"]]]],
      [
        "module-2",
        2,
        [
          ["lesson-2", ["media-2", "media-1"]],
          ["lesson-1", ["media-3"]],
        ],
      ],
    ],
  );
  assert.match(db.calls[0]?.sql ?? "", /ORDER BY/);
});

test("does not expose a module whose published mirror is missing a lesson", async () => {
  const db = dataSource({
    moduleRows: [
      {
        lessonIds: ["lesson-present", "lesson-missing"],
        moduleOrder: 1,
        programmeId: "programme-1",
        slug: "module-1",
        sourceDocumentId: "module-1-source",
        title: "Incomplete",
      },
    ],
    lessonRows: [
      {
        attachmentsIds: [],
        body: null,
        slug: "lesson-present",
        sourceDocumentId: "lesson-present",
        summary: null,
        title: "Present",
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  assert.deepEqual(await reader.modulesForProgramme("programme-1"), []);
});

test("keeps two finale tasks distinct by authored order and post number", async () => {
  const db = dataSource({
    taskRows: [
      taskRow({
        contentType: "photo",
        dayNumber: 21,
        dayType: "push",
        instructions: null,
        lessonId: "lesson-21",
        moduleId: "module-6",
        orderWithinDay: 2,
        outputDescription: null,
        pausePrompt: null,
        postNumber: 10,
        programmeId: "programme-1",
        publishSlot: true,
        slug: "first-take-day-21-post-10",
        sourceDocumentId: "task-10",
        timeEstimateMinutes: 60,
        title: "Post 10",
      }),
      taskRow({
        contentType: "video",
        dayNumber: 21,
        dayType: "push",
        instructions: null,
        lessonId: "lesson-21",
        moduleId: "module-6",
        orderWithinDay: 1,
        outputDescription: null,
        pausePrompt: null,
        postNumber: 9,
        programmeId: "programme-1",
        publishSlot: true,
        slug: "first-take-day-21-post-9",
        sourceDocumentId: "task-9",
        timeEstimateMinutes: 60,
        title: "Post 9",
      }),
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const tasks = await reader.tasksForProgramme("programme-1");

  assert.deepEqual(
    tasks.map((task) => [task.orderWithinDay, task.postNumber, task.contentType]),
    [
      [1, 9, "video"],
      [2, 10, "photo"],
    ],
  );
});

test("does not return a task outside the assigned programme or module", async () => {
  const db = dataSource({ taskRows: [] });
  const reader = new ProgrammeContentRepository(db as never);

  assert.equal(
    await reader.findProgrammeTask("programme-1", "task-from-another-programme"),
    undefined,
  );
  assert.match(db.calls[0]?.sql ?? "", /module.*programme|programme.*module/is);
  assert.deepEqual(db.calls[0]?.parameters, [
    "programme-1",
    "task-from-another-programme",
  ]);
});

// "first-take" is one of the slugs the authored catalogue in
// programme-content.ts still carries. The mirror is the only source the
// production mapper reads, so the catalogue's copy must not leak back in when
// the content team changes a programme in Payload.
test("a programme whose slug is in the authored catalogue still reads from the mirror", async () => {
  const db = dataSource({
    programmeRows: [
      {
        access: "open",
        ctaText: null,
        description: "Rewritten in Payload after the catalogue was frozen.",
        difficulty: "hard",
        durationDays: 28,
        expectations: null,
        experienceLevel: "advanced",
        founderVideoUrl: null,
        insightMoments: [],
        milestones: [],
        slug: "first-take",
        sourceDocumentId: "programme-1",
        title: "First Take, Second Edition",
        track: "starter",
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const programme = await reader.findProgramme("first-take");

  assert.equal(
    programme?.description,
    "Rewritten in Payload after the catalogue was frozen.",
  );
  assert.equal(programme?.title, "First Take, Second Edition");
  assert.equal(programme?.durationDays, 28);
  assert.equal(programme?.durationLabel, "28 days");
  assert.equal(programme?.level, "Advanced");
  assert.deepEqual(programme?.features, [
    { icon: "clock", label: "28 days programme" },
  ]);
});

test("a programme the authored catalogue never knew about maps the same way", async () => {
  const db = dataSource({
    programmeRows: [
      {
        access: "open",
        ctaText: null,
        description: null,
        difficulty: null,
        durationDays: 1,
        expectations: null,
        experienceLevel: null,
        founderVideoUrl: null,
        insightMoments: [],
        milestones: [],
        slug: "a-programme-authored-last-week",
        sourceDocumentId: "programme-9",
        title: "Brand New",
        track: null,
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const programme = await reader.findProgramme("a-programme-authored-last-week");

  assert.equal(programme?.description, "");
  assert.equal(programme?.durationLabel, "1 day");
  assert.equal(programme?.level, "Beginner");
  assert.deepEqual(programme?.features, [
    { icon: "clock", label: "1 day programme" },
  ]);
});

test("a programme with no authored duration carries no duration copy", async () => {
  const db = dataSource({
    programmeRows: [
      {
        access: "open",
        ctaText: null,
        description: null,
        difficulty: null,
        durationDays: null,
        expectations: null,
        experienceLevel: null,
        founderVideoUrl: null,
        insightMoments: [],
        milestones: [],
        slug: "15-day-jumpstart",
        sourceDocumentId: "programme-2",
        title: "Jumpstart",
        track: null,
      },
    ],
  });
  const reader = new ProgrammeContentRepository(db as never);

  const programme = await reader.findProgramme("15-day-jumpstart");

  assert.equal(programme?.durationDays, 0);
  assert.equal(programme?.durationLabel, "");
  assert.deepEqual(programme?.features, []);
});
