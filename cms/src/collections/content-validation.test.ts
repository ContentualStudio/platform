import assert from "node:assert/strict";
import test from "node:test";

import {
  activeLessonPlatforms,
  insightMomentTriggerOptions,
  lessonPlatformValues,
  lessonTypeOptions,
  taskContentTypeOptions,
  validateLessonBeforePublish,
  validateLessonFields,
  validateModuleBeforePublish,
  validateProgrammeBeforePublish,
  validateTaskBeforePublish,
  validateModuleFields,
  validateTaskFields,
} from "./content-validation";

test("accepts a valid First Take task schedule", () => {
  assert.deepEqual(
    validateTaskFields(
      {
        dayNumber: 21,
        dayType: "push",
        module: 8,
        orderWithinDay: 2,
        postNumber: 10,
        programme: 3,
        publishSlot: true,
        timeEstimateMinutes: 15,
      },
      21,
    ),
    [],
  );
});

test("rejects invalid task day, order, day type, and time values", () => {
  const errors = validateTaskFields(
    {
      dayNumber: 0,
      dayType: "rest",
      orderWithinDay: 0,
      timeEstimateMinutes: 0,
    },
    21,
  );

  assert.deepEqual(errors, [
    "dayNumber must be a positive integer",
    "orderWithinDay must be a positive integer",
    "dayType must be one of push, protect, or recharge",
    "timeEstimateMinutes must be a positive integer",
  ]);
});

test("rejects a task day beyond the programme duration", () => {
  assert.deepEqual(
    validateTaskFields({ dayNumber: 22, orderWithinDay: 1 }, 21),
    ["dayNumber must not exceed the programme duration"],
  );
});

test("requires post number exactly for publish slots", () => {
  assert.deepEqual(
    validateTaskFields({ orderWithinDay: 1, publishSlot: true }, 21),
    ["postNumber is required when publishSlot is enabled"],
  );
  assert.deepEqual(
    validateTaskFields(
      { orderWithinDay: 1, postNumber: 4, publishSlot: false },
      21,
    ),
    ["postNumber must be empty when publishSlot is disabled"],
  );
});

test("requires positive module order and programme ownership fields", () => {
  assert.deepEqual(
    validateModuleFields({ order: 0, programme: null, lessons: [] }),
    [
      "order must be a positive integer",
      "programme is required",
      "lessons must contain at least one lesson",
    ],
  );
});

test("accepts only the authored task content types and insight triggers", () => {
  assert.deepEqual(taskContentTypeOptions, [
    "video",
    "photo",
    "caption",
    "story",
  ]);
  assert.deepEqual(insightMomentTriggerOptions, [
    "day",
    "task_completed",
    "week_completed",
    "three_consecutive_skipped_days",
  ]);
  assert.deepEqual(
    validateTaskFields({ contentType: "video" }, 21, true),
    [],
  );
  assert.deepEqual(
    validateTaskFields({ contentType: "reel" }, 21, true),
    ["contentType must be one of video, photo, caption, or story"],
  );
  assert.deepEqual(validateTaskFields({}, 21, true), [
    "contentType is required when publishing a task",
  ]);
});

function payloadStub(options: {
  programmes?: Record<string, Record<string, unknown>>;
  modules?: Record<string, Record<string, unknown>>;
  duplicateTasks?: boolean;
  duplicateModules?: boolean;
}) {
  return {
    findByID: async ({ collection, id }: Record<string, unknown>) =>
      (options[collection === "programmes" ? "programmes" : "modules"] ?? {})[
        String(id)
      ],
    find: async ({ collection }: Record<string, unknown>) => ({
      totalDocs:
        collection === "tasks"
          ? options.duplicateTasks
            ? 1
            : 0
          : options.duplicateModules
            ? 1
            : 0,
    }),
  };
}

test("rejects published tasks that point to missing, draft, or cross-programme modules", async () => {
  const cases: Array<{
    modules: Record<string, Record<string, unknown>>;
    message: string;
  }> = [
    {
      modules: {},
      message: "module must reference an existing published module",
    },
    {
      modules: { "7": { id: 7, _status: "draft", programme: 3 } },
      message: "module must reference a published module",
    },
    {
      modules: { "7": { id: 7, _status: "published", programme: 4 } },
      message: "module must belong to the same programme as the task",
    },
  ];

  for (const entry of cases) {
    await assert.rejects(
      () =>
        validateTaskBeforePublish({
          data: {
            _status: "published",
            contentType: "video",
            dayNumber: 1,
            module: 7,
            orderWithinDay: 1,
            programme: 3,
            publishSlot: false,
            timeEstimateMinutes: 30,
          },
          originalDoc: undefined,
          req: {
            payload: payloadStub({
              modules: entry.modules,
              programmes: { "3": { id: 3, _status: "published", durationDays: 21 } },
            }),
          },
        } as never),
      (error: unknown) => {
        assert.match(JSON.stringify(error), new RegExp(entry.message));
        return true;
      },
    );
  }
});

test("published task and module uniqueness checks use the scoped programme", async () => {
  await assert.rejects(
    () =>
      validateTaskBeforePublish({
        data: {
          _status: "published",
          contentType: "video",
          dayNumber: 1,
          module: 7,
          orderWithinDay: 1,
          programme: 3,
          publishSlot: false,
          timeEstimateMinutes: 30,
        },
        originalDoc: undefined,
        req: {
          payload: payloadStub({
            modules: { "7": { id: 7, _status: "published", programme: 3 } },
            programmes: { "3": { id: 3, _status: "published", durationDays: 21 } },
            duplicateTasks: true,
          }),
        },
      } as never),
    (error: unknown) => {
      assert.match(
        JSON.stringify(error),
        /programme, dayNumber, and orderWithinDay must be unique together/,
      );
      return true;
    },
  );

  await assert.rejects(
    () =>
      validateModuleBeforePublish({
        data: {
          _status: "published",
          lessons: [1],
          order: 1,
          programme: 3,
        },
        originalDoc: undefined,
        req: {
          payload: payloadStub({
            duplicateModules: true,
            programmes: { "3": { id: 3, _status: "published", durationDays: 21 } },
          }),
        },
      } as never),
    (error: unknown) => {
      assert.match(JSON.stringify(error), /order must be unique within a programme/);
      return true;
    },
  );
});

test("partial published updates validate merged data and drafts remain saveable", async () => {
  await assert.rejects(
    () =>
      validateTaskBeforePublish({
        data: { contentType: "reel", orderWithinDay: 2 },
        originalDoc: {
          _status: "published",
          contentType: "video",
          dayNumber: 1,
          module: 7,
          orderWithinDay: 1,
          programme: 3,
          publishSlot: false,
          timeEstimateMinutes: 30,
        },
        req: {
          payload: payloadStub({
            modules: { "7": { id: 7, _status: "published", programme: 3 } },
            programmes: { "3": { id: 3, _status: "published", durationDays: 21 } },
          }),
        },
      } as never),
    (error: unknown) => {
      assert.match(
        JSON.stringify(error),
        /contentType must be one of video, photo, caption, or story/,
      );
      return true;
    },
  );

  const result = await validateTaskBeforePublish({
    data: { title: "Incomplete draft" },
    originalDoc: { _status: "draft" },
    req: { payload: payloadStub({}) },
  } as never);
  assert.deepEqual(result, { title: "Incomplete draft" });
});

function validLesson(overrides: Record<string, unknown> = {}) {
  return {
    body: { root: {} },
    contentType: "video",
    lessonType: "article",
    platforms: ["instagram"],
    programmeDayEnd: 7,
    programmeDayStart: 1,
    programmeRelevance: [3],
    skillLevel: "beginner",
    ...overrides,
  };
}

test("lesson vocabulary matches the closed tagging contract", () => {
  assert.deepEqual([...lessonTypeOptions], [
    "article",
    "video",
    "masterclass",
    "template",
  ]);
  assert.deepEqual([...lessonPlatformValues], [
    "instagram",
    "youtube",
    "tiktok",
    "linkedin",
  ]);
  assert.deepEqual([...activeLessonPlatforms], ["instagram"]);
});

test("a fully tagged lesson publishes", () => {
  assert.deepEqual(validateLessonFields(validLesson(), true), []);
  assert.deepEqual(
    validateLessonFields(
      validLesson({
        body: null,
        lessonType: "video",
        vimeoVideoId: "123",
      }),
      true,
    ),
    [],
  );
  assert.deepEqual(
    validateLessonFields(
      validLesson({
        body: null,
        lessonType: "template",
        templateFile: "media-1",
      }),
      true,
      "application/pdf",
    ),
    [],
  );
});

test("publishing a lesson requires every tag", () => {
  const required = [
    "lessonType",
    "skillLevel",
    "contentType",
    "platforms",
    "programmeRelevance",
    "programmeDayStart",
    "programmeDayEnd",
  ];

  for (const field of required) {
    const input = validLesson({ [field]: undefined });
    // Empty arrays read the same as missing for hasMany tags.
    if (field === "platforms" || field === "programmeRelevance") {
      assert.ok(
        validateLessonFields(validLesson({ [field]: [] }), true).some(
          (message) => message.startsWith(field),
        ),
        `${field} must reject an empty array`,
      );
    }
    assert.ok(
      validateLessonFields(input, true).some((message) =>
        message.startsWith(field),
      ),
      `${field} must be required when publishing`,
    );
  }

  // Drafts stay saveable with no tags at all.
  assert.deepEqual(validateLessonFields({}, false), []);
});

test("lesson vocabulary is checked even on drafts", () => {
  assert.deepEqual(validateLessonFields({ lessonType: "essay" }, false), [
    "lessonType must be one of article, video, masterclass, template",
  ]);
  assert.deepEqual(validateLessonFields({ skillLevel: "expert" }, false), [
    "skillLevel must be one of beginner, intermediate, advanced",
  ]);
  assert.deepEqual(validateLessonFields({ contentType: "reel" }, false), [
    "contentType must be one of video, photo, caption, story",
  ]);
  assert.deepEqual(
    validateLessonFields({ platforms: ["myspace"] }, false),
    ["platforms must be one of instagram, youtube, tiktok, linkedin"],
  );
});

test("lesson programme days must be positive integers in order", () => {
  assert.ok(
    validateLessonFields(
      validLesson({ programmeDayStart: 1.5 }),
      true,
    ).includes("programmeDayStart must be a positive integer"),
  );
  assert.ok(
    validateLessonFields(validLesson({ programmeDayEnd: 0 }), true).includes(
      "programmeDayEnd must be a positive integer",
    ),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ programmeDayStart: 8, programmeDayEnd: 7 }),
      true,
    ).includes("programmeDayStart must not exceed programmeDayEnd"),
  );
});

test("lesson body must match its type", () => {
  assert.ok(
    validateLessonFields(validLesson({ body: null }), true).includes(
      "body is required when lessonType is article",
    ),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ vimeoVideoId: "123" }),
      true,
    ).includes("vimeoVideoId must be empty when lessonType is article"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ templateFile: "media-1" }),
      true,
      "application/pdf",
    ).includes("templateFile must be empty when lessonType is article"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "video", body: null }),
      true,
    ).includes("vimeoVideoId is required when lessonType is video"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "masterclass", body: null }),
      true,
    ).includes("vimeoVideoId is required when lessonType is masterclass"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "template", body: null }),
      true,
      "application/pdf",
    ).includes("templateFile is required when lessonType is template"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "template", body: null, templateFile: "m1" }),
      true,
      "image/png",
    ).includes("templateFile must be a PDF"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "template", body: null, templateFile: "m1" }),
      true,
    ).includes("templateFile must be a PDF"),
    "an unresolvable mime type must fail closed",
  );
});

test("a type switch cannot publish stale fields from the previous type", () => {
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "video", vimeoVideoId: "123" }),
      true,
    ).includes("body must be empty when lessonType is video"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({
        body: null,
        lessonType: "video",
        templateFile: "m1",
        vimeoVideoId: "123",
      }),
      true,
      "application/pdf",
    ).includes("templateFile must be empty when lessonType is video"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "masterclass", vimeoVideoId: "123" }),
      true,
    ).includes("body must be empty when lessonType is masterclass"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({
        lessonType: "template",
        templateFile: "m1",
        vimeoVideoId: "123",
      }),
      true,
      "application/pdf",
    ).includes("vimeoVideoId must be empty when lessonType is template"),
  );
  assert.ok(
    validateLessonFields(
      validLesson({ lessonType: "template", templateFile: "m1" }),
      true,
      "application/pdf",
    ).includes("body must be empty when lessonType is template"),
  );
});

test("lesson publish hook validates merged data and leaves drafts alone", async () => {
  await assert.rejects(
    () =>
      validateLessonBeforePublish({
        data: { skillLevel: "expert" },
        originalDoc: { _status: "published", ...validLesson() },
        req: { payload: payloadStub({}) },
      } as never),
    (error: unknown) => {
      assert.match(JSON.stringify(error), /skillLevel must be one of/);
      return true;
    },
  );

  const draft = await validateLessonBeforePublish({
    data: { title: "Incomplete draft" },
    originalDoc: { _status: "draft" },
    req: { payload: payloadStub({}) },
  } as never);
  assert.deepEqual(draft, { title: "Incomplete draft" });
});

test("lesson template mime resolves through the media lookup", async () => {
  const payloadWithMedia = (mimeType: string) => ({
    findByID: async () => ({ id: "m1", mimeType }),
    find: async () => ({ totalDocs: 0 }),
  });

  await assert.rejects(
    () =>
      validateLessonBeforePublish({
        data: { _status: "published" },
        originalDoc: validLesson({
          _status: "published",
          body: null,
          lessonType: "template",
          templateFile: "m1",
        }),
        req: { payload: payloadWithMedia("image/png") },
      } as never),
    (error: unknown) => {
      assert.match(JSON.stringify(error), /templateFile must be a PDF/);
      return true;
    },
  );

  const result = await validateLessonBeforePublish({
    data: { _status: "published" },
    originalDoc: validLesson({
      _status: "published",
      body: null,
      lessonType: "template",
      templateFile: "m1",
    }),
    req: { payload: payloadWithMedia("application/pdf") },
  } as never);
  assert.deepEqual(result, { _status: "published" });

  await assert.rejects(
    () =>
      validateLessonBeforePublish({
        data: { _status: "published" },
        originalDoc: validLesson({
          _status: "published",
          body: null,
          lessonType: "template",
          templateFile: "m1",
        }),
        req: {
          payload: {
            findByID: async () => {
              throw new Error("media row gone");
            },
            find: async () => ({ totalDocs: 0 }),
          },
        },
      } as never),
    (error: unknown) => {
      assert.match(JSON.stringify(error), /templateFile must be a PDF/);
      return true;
    },
  );
});

test("programme publication validates milestone bounds and insight triggers", async () => {
  await assert.rejects(
    () =>
      validateProgrammeBeforePublish({
        data: {
          _status: "published",
          durationDays: 21,
          insightMoments: [
            {
              copy: { root: {} },
              triggerCondition: "x",
              triggerType: "unknown",
            },
          ],
          milestones: [
            { copy: { root: {} }, name: "Late", triggerDay: 22 },
          ],
        },
        originalDoc: undefined,
        req: { payload: payloadStub({}) },
      } as never),
    (error: unknown) => {
      assert.match(
        JSON.stringify(error),
        /triggerDay must not exceed the programme duration|triggerType must be one of/,
      );
      return true;
    },
  );
});
