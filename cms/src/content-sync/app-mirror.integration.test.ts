import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { Pool } from "pg";
import {
  deleteProjection,
  replaceCollection,
  upsertProjection,
} from "./app-mirror";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import { projectDocument } from "./mappings";

// These cover the generated SQL, which unit tests cannot reach. They run only
// when pointed at a database that has the app mirror migration applied:
//
//   APP_MIRROR_DATABASE_URL=postgresql://... yarn workspace @contentual/cms test
const connectionString = process.env.APP_MIRROR_DATABASE_URL;
const options = {
  skip: connectionString
    ? false
    : "APP_MIRROR_DATABASE_URL is not set; skipping app mirror integration tests",
};

const pool = connectionString ? new Pool({ connectionString }) : undefined;

after(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await pool?.query(
    `TRUNCATE programme, programme_modules, programme_tasks, studio_lessons, engine_rules, engine_badges,
              engine_call_types, content_mirror_sync_events`,
  );
});

function programme(id: number, title: string, lessons: unknown[]) {
  return projectDocument("programmes", {
    _status: "published",
    description: null,
    id,
    lessons,
    slug: `p-${id}`,
    title,
    updatedAt: "2026-07-20T10:00:00.000Z",
  });
}

function moduleDocument(id: number, order: number) {
  return projectDocument("modules", {
    _status: "published",
    id,
    lessons: [{ id: 5 }, 6],
    order,
    programme: { id: 42 },
    slug: `module-${id}`,
    title: `Module ${id}`,
    updatedAt: "2026-07-20T10:00:00.000Z",
  });
}

function taskDocument(id: number) {
  return projectDocument("tasks", {
    _status: "published",
    contentType: "video",
    dayNumber: 9,
    dayType: "push",
    id,
    instructions: { root: { children: [{ text: "Publish" }] } },
    lesson: { id: 6 },
    module: 12,
    orderWithinDay: 2,
    outputDescription: { root: { children: [{ text: "A post" }] } },
    pausePrompt: null,
    postNumber: 4,
    programme: 42,
    publishSlot: true,
    slug: `task-${id}`,
    timeEstimateMinutes: 45,
    title: "Publish a post",
    updatedAt: "2026-07-20T10:00:00.000Z",
  });
}

async function rows(table: string): Promise<Record<string, unknown>[]> {
  const result = await pool!.query(
    `SELECT * FROM ${table} ORDER BY "sourceDocumentId"`,
  );

  return result.rows;
}

test("publishing inserts a row and re-publishing updates it in place", options, async () => {
  await upsertProjection(programme(1, "One", [{ id: 5 }, 6]), "job-1");

  let current = await rows("programme");
  assert.equal(current.length, 1);
  assert.equal(current[0].title, "One");
  assert.deepEqual(current[0].lessonIds, ["5", "6"]);
  assert.equal(current[0].description, null);

  await upsertProjection(programme(1, "One Renamed", [{ id: 5 }]), "job-2");

  current = await rows("programme");
  assert.equal(current.length, 1, "re-publish must not insert a second row");
  assert.equal(current[0].title, "One Renamed");
  assert.deepEqual(current[0].lessonIds, ["5"]);
});

test("jsonb and relationship columns round-trip, and deletes remove the row", options, async () => {
  await upsertProjection(
    projectDocument("lessons", {
      _status: "published",
      attachments: [{ id: 3 }],
      body: { root: { children: [{ text: "hi" }] } },
      id: 77,
      slug: "l-77",
      summary: "",
      title: "Lesson",
      updatedAt: "2026-07-20T10:00:00.000Z",
    }),
    "job-3",
  );

  const lessons = await rows("studio_lessons");
  assert.deepEqual(lessons[0].body, { root: { children: [{ text: "hi" }] } });
  assert.deepEqual(lessons[0].attachmentsIds, ["3"]);
  assert.equal(lessons[0].summary, null, "an empty string projects as null");

  await deleteProjection("lessons", "77", "job-4");
  assert.equal((await rows("studio_lessons")).length, 0);
});

function taggedLesson(id: number, overrides: Record<string, unknown> = {}) {
  return projectDocument("lessons", {
    _status: "published",
    attachments: [{ id: 3 }],
    body: { root: { children: [{ text: "hi" }] } },
    contentType: "video",
    id,
    lessonType: "video",
    minimumTier: "creator",
    platforms: ["instagram"],
    programmeDayEnd: 7,
    programmeDayStart: 1,
    programmeRelevance: [{ id: 42 }],
    skillLevel: "beginner",
    slug: `l-${id}`,
    summary: "A tagged lesson.",
    templateFile: 9,
    title: "Tagged lesson",
    updatedAt: "2026-07-20T10:00:00.000Z",
    vimeoVideoId: "123",
    ...overrides,
  });
}

test("a tagged lesson publishes, re-publishes in place, and unpublishes", options, async () => {
  await upsertProjection(taggedLesson(78), "job-lesson-1");

  let lessons = await rows("studio_lessons");
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].sourceDocumentId, "78");
  assert.equal(lessons[0].lessonType, "video");
  assert.equal(lessons[0].skillLevel, "beginner");
  assert.equal(lessons[0].contentType, "video");
  assert.deepEqual(lessons[0].platforms, ["instagram"]);
  assert.deepEqual(lessons[0].programmeRelevance, ["42"]);
  assert.equal(lessons[0].programmeDayStart, 1);
  assert.equal(lessons[0].programmeDayEnd, 7);
  assert.equal(lessons[0].vimeoVideoId, "123");
  assert.equal(lessons[0].templateMediaId, "9");

  await upsertProjection(
    taggedLesson(78, { title: "Tagged lesson renamed" }),
    "job-lesson-2",
  );

  lessons = await rows("studio_lessons");
  assert.equal(lessons.length, 1, "re-publish must not insert a second row");
  assert.equal(lessons[0].title, "Tagged lesson renamed");

  await deleteProjection("lessons", "78", "job-lesson-3");
  assert.equal((await rows("studio_lessons")).length, 0);
});

test("modules and scheduled tasks round-trip through typed mirror columns", options, async () => {
  await upsertProjection(moduleDocument(12, 2), "job-module");
  await upsertProjection(taskDocument(99), "job-task");

  const modules = await rows("programme_modules");
  assert.equal(modules[0].moduleOrder, 2);
  assert.equal(modules[0].programmeId, "42");
  assert.deepEqual(modules[0].lessonIds, ["5", "6"]);

  const tasks = await rows("programme_tasks");
  assert.equal(tasks[0].dayNumber, 9);
  assert.equal(tasks[0].orderWithinDay, 2);
  assert.equal(tasks[0].timeEstimateMinutes, 45);
  assert.equal(tasks[0].publishSlot, true);
  assert.equal(tasks[0].postNumber, 4);
  assert.equal(tasks[0].moduleId, "12");
  assert.equal(tasks[0].contentType, "video");
  assert.deepEqual(tasks[0].outputDescription, {
    root: { children: [{ text: "A post" }] },
  });
});

test("backfill inserts missing rows, updates changed rows, and drops orphans", options, async () => {
  await upsertProjection(programme(1, "One", []), "job-5");
  await upsertProjection(programme(2, "Orphan", []), "job-6");

  await replaceCollection(
    "programmes",
    [programme(1, "Backfilled", [{ id: 9 }]), programme(3, "Fresh", [])],
    "job-7",
  );

  const current = await rows("programme");
  assert.deepEqual(
    current.map((row) => [row.sourceDocumentId, row.title]),
    [
      ["1", "Backfilled"],
      ["3", "Fresh"],
    ],
  );
  assert.deepEqual(current[0].lessonIds, ["9"]);

  // The staging table is transaction-scoped; a leak would break the next run.
  const leaked = await pool!.query(
    `SELECT to_regclass('content_mirror_backfill_stage') AS stage`,
  );
  assert.equal(leaked.rows[0].stage, null, "staging table leaked");
});

test("backfill of an empty published set clears the mirror", options, async () => {
  await upsertProjection(programme(1, "One", []), "job-8");
  await replaceCollection("programmes", [], "job-9");

  assert.equal((await rows("programme")).length, 0);
});

test("backfill stages more rows than fit in a single insert", options, async () => {
  const many = Array.from({ length: 1200 }, (_, index) =>
    programme(1000 + index, `Bulk ${index}`, [{ id: index }]),
  );

  await replaceCollection("programmes", many, "job-10");

  assert.equal((await rows("programme")).length, 1200);
});

test("every sync operation records an observable outcome", options, async () => {
  await upsertProjection(programme(1, "One", []), "job-11");
  await deleteProjection("programmes", "1", "job-12");
  await replaceCollection("programmes", [], "job-13");

  const events = await pool!.query(
    `SELECT "operation", "status", "payloadJobId"
     FROM content_mirror_sync_events ORDER BY "id"`,
  );

  assert.deepEqual(
    events.rows,
    [
      { operation: "upsert", status: "succeeded", payloadJobId: "job-11" },
      { operation: "delete", status: "succeeded", payloadJobId: "job-12" },
      { operation: "backfill", status: "succeeded", payloadJobId: "job-13" },
    ],
  );
});

function rule(id: number, overrides: Record<string, unknown> = {}) {
  return projectDocument("engine-rules", {
    _status: "published",
    active: true,
    conditions: [],
    dedupeScope: dedupeScopeTokens.oncePerUser,
    description: null,
    effectType: effectTypeTokens.inAppMessage,
    id,
    key: `rule-${id}`,
    message: "Nice work",
    name: `Rule ${id}`,
    triggerEvent: eventNameTokens.taskCompleted,
    updatedAt: "2026-07-21T09:00:00.000Z",
    ...overrides,
  });
}

function catalogueEntry(
  collection: "engine-badges" | "engine-call-types",
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return projectDocument(collection, {
    _status: "published",
    active: true,
    description: null,
    id,
    key: `entry-${id}`,
    name: `Entry ${id}`,
    updatedAt: "2026-07-21T09:00:00.000Z",
    ...overrides,
  });
}

test("normalized conditions and every effect parameter shape round-trip", options, async () => {
  const conditions = [
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
    {
      source: conditionSourceTokens.user,
      field: "subscription_status",
      operator: operatorTokens.in,
      value: ["pro", "trial"],
    },
  ];

  await upsertProjection(rule(1, { conditions }), "job-rule-1");
  await upsertProjection(
    rule(2, { effectType: effectTypeTokens.suggestProgramme, programme: 12, message: null }),
    "job-rule-2",
  );
  await upsertProjection(
    rule(3, { effectType: effectTypeTokens.unlockProgramme, programme: { id: 12 }, message: null }),
    "job-rule-3",
  );
  await upsertProjection(
    rule(4, { effectType: effectTypeTokens.awardBadge, badge: 7, message: null }),
    "job-rule-4",
  );
  await upsertProjection(
    rule(5, { effectType: effectTypeTokens.promptCall, callType: "3", message: null }),
    "job-rule-5",
  );

  const stored = await rows("engine_rules");

  assert.deepEqual(stored[0].conditions, conditions, "jsonb must survive verbatim");
  assert.deepEqual(
    stored.map((row) => row.effectParams),
    [
      { message: "Nice work" },
      { programmeSourceId: "12" },
      { programmeSourceId: "12" },
      { badgeSourceId: "7" },
      { callTypeSourceId: "3" },
    ],
  );
  assert.equal(stored[0].triggerEvent, eventNameTokens.taskCompleted);
  assert.equal(stored[0].dedupeScope, dedupeScopeTokens.oncePerUser);
});

test("a published inactive rule stays mirrored and is excluded only by the query", options, async () => {
  await upsertProjection(rule(1), "job-active");
  await upsertProjection(rule(2, { active: false }), "job-inactive");

  const all = await rows("engine_rules");
  assert.deepEqual(
    all.map((row) => [row.sourceDocumentId, row.active]),
    [
      ["1", true],
      ["2", false],
    ],
    "an inactive rule must remain in the mirror",
  );

  // How the evaluator will read it: filtered, not deleted.
  const eligible = await pool!.query(
    `SELECT "sourceDocumentId" FROM engine_rules
     WHERE "triggerEvent" = $1 AND "active" ORDER BY 1`,
    [eventNameTokens.taskCompleted],
  );
  assert.deepEqual(
    eligible.rows.map((row) => row.sourceDocumentId),
    ["1"],
  );
});

test("catalogue entries publish, update and delete", options, async () => {
  for (const collection of ["engine-badges", "engine-call-types"] as const) {
    const table = collection.replace(/-/g, "_");

    await upsertProjection(catalogueEntry(collection, 1), `job-${table}-1`);
    let stored = await rows(table);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].active, true);
    assert.equal(stored[0].key, "entry-1");

    // Deactivating is an update, not a removal: consumers must be able to see
    // that a definition exists but is switched off.
    await upsertProjection(
      catalogueEntry(collection, 1, { active: false, name: "Renamed" }),
      `job-${table}-2`,
    );
    stored = await rows(table);
    assert.equal(stored.length, 1, "re-publish must not insert a second row");
    assert.equal(stored[0].active, false);
    assert.equal(stored[0].name, "Renamed");

    await deleteProjection(collection, "1", `job-${table}-3`);
    assert.equal((await rows(table)).length, 0);
  }
});

test("a rule backfill produces the same rows as incremental sync", options, async () => {
  const projections = [
    rule(1, {
      conditions: [
        {
          source: conditionSourceTokens.user,
          field: "is_founding_creator",
          operator: operatorTokens.eq,
          value: true,
        },
      ],
    }),
    rule(2, { active: false, effectType: effectTypeTokens.awardBadge, badge: 7, message: null }),
  ];

  for (const projection of projections) {
    await upsertProjection(projection, "job-incremental");
  }
  const incremental = await rows("engine_rules");

  await pool!.query(`TRUNCATE engine_rules`);
  await replaceCollection("engine-rules", projections, "job-backfill");
  const backfilled = await rows("engine_rules");

  // mirroredAt is write-time metadata, so it differs by construction.
  const comparable = (source: Record<string, unknown>[]) =>
    source.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([column]) => column !== "mirroredAt"),
      ),
    );

  assert.deepEqual(comparable(backfilled), comparable(incremental));
});

test("the mirror roles keep write access separated from read access", options, async () => {
  // Asserted through the privilege catalogue rather than by logging in: the
  // login roles are environment-specific, but the grants these tables carry are
  // the actual authorization boundary.
  const tables = ["engine_rules", "engine_badges", "engine_call_types"];
  const writes = ["INSERT", "UPDATE", "DELETE"];

  for (const table of tables) {
    const granted = async (role: string, privilege: string) => {
      const result = await pool!.query(
        `SELECT has_table_privilege($1, $2, $3) AS allowed`,
        [role, table, privilege],
      );
      return result.rows[0].allowed as boolean;
    };

    assert.equal(
      await granted("content_mirror_reader", "SELECT"),
      true,
      `${table}: the reader must be able to select`,
    );
    assert.equal(
      await granted("content_mirror_writer", "SELECT"),
      true,
      `${table}: the writer must be able to select`,
    );

    for (const privilege of writes) {
      assert.equal(
        await granted("content_mirror_writer", privilege),
        true,
        `${table}: the writer must be able to ${privilege}`,
      );
      assert.equal(
        await granted("content_mirror_reader", privilege),
        false,
        `${table}: the reader must not be able to ${privilege}`,
      );
    }
  }
});
