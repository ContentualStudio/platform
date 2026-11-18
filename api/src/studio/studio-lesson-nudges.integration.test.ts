import "reflect-metadata";
import * as assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { StudioLessonNudgesService } from "./studio-lesson-nudges.service";

const USER = "studio-nudge-integration";
const OTHER = "studio-nudge-other";
const PROGRAMME = "studio-nudge-programme";
let db: DataSource;
let service: StudioLessonNudgesService;
let enrolmentId: string;
async function clear() {
  await db.query('DELETE FROM "user" WHERE "id" = ANY($1)', [[USER, OTHER]]);
  await db.query(
    'DELETE FROM "studio_lessons" WHERE "sourceDocumentId" LIKE $1',
    ["studio-nudge-%"],
  );
  await db.query('DELETE FROM "programme" WHERE "sourceDocumentId" = $1', [
    PROGRAMME,
  ]);
}
async function lesson(
  id: string,
  category = "video",
  programme = PROGRAMME,
  start = 3,
  end = 3,
) {
  await db.query(
    `INSERT INTO "studio_lessons"
    ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title", "contentType", "programmeRelevance", "programmeDayStart", "programmeDayEnd")
    VALUES ($1, now(), now(), $1, $1, $2, ARRAY[$3]::text[], $4, $5)`,
    [id, category, programme, start, end],
  );
}
before(async () => {
  if (!skip) {
    db = await openTestDataSource();
    service = new StudioLessonNudgesService(db);
  }
});
beforeEach(async () => {
  if (skip) return;
  await clear();
  for (const id of [USER, OTHER])
    await db.query(
      'INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)',
      [id, `${id}@example.test`],
    );
  await db.query(
    `INSERT INTO "programme" ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title") VALUES ($1, now(), now(), $1, $1)`,
    [PROGRAMME],
  );
  const [enrolment] = await db.query(
    `INSERT INTO "programme_enrolment" ("userId", "programmeSlug", "status", "startedAt", "currentDay", "durationDays", "day1ScheduledFor")
    VALUES ($1, $2, 'active', now(), 4, 30, (now() AT TIME ZONE 'UTC')::date) RETURNING "id"`,
    [USER, PROGRAMME],
  );
  enrolmentId = enrolment.id;
  await db.query(
    `INSERT INTO "programme_day_serve" ("enrolmentId", "userId", "programmeSlug", "programmeDay", "localDate", "taskId", "outcome")
    VALUES ($1, $2, $3, 3, (now() AT TIME ZONE 'UTC')::date, 'task', 'served')`,
    [enrolmentId, USER, PROGRAMME],
  );
  await db.query(
    `INSERT INTO "programme_task_progress" ("assignmentId", "userId", "programmeId", "taskId", "outcome", "weekIndex", "contentType", "localDate")
    VALUES ($1, $2, $3, 'task', 'completed', 1, 'video', (now() AT TIME ZONE 'UTC')::date)`,
    [enrolmentId, USER, PROGRAMME],
  );
});
after(async () => {
  if (db?.isInitialized) {
    await clear();
    await db.destroy();
  }
});

test(
  "matches category, stable programme identity and exact delivered day bounds",
  { skip },
  async () => {
    await lesson("studio-nudge-match");
    await lesson("studio-nudge-wrong-category", "photo");
    await lesson("studio-nudge-wrong-programme", "video", "other");
    await lesson("studio-nudge-wrong-day", "video", PROGRAMME, 4, 7);
    assert.deepEqual(await service.claimForCompletedTask(USER, "task"), {
      category: "video",
      lessonIds: ["studio-nudge-match"],
    });
  },
);
test(
  "concurrent claims show once and replays never re-show",
  { skip },
  async () => {
    await lesson("studio-nudge-one");
    await lesson("studio-nudge-two");
    const results = await Promise.all([
      service.claimForCompletedTask(USER, "task"),
      service.claimForCompletedTask(USER, "task"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.find(Boolean)?.lessonIds.length, 2);
    assert.equal(await service.claimForCompletedTask(USER, "task"), null);
    const rows = await db.query(
      'SELECT * FROM "studio_lesson_nudges" WHERE "userId" = $1',
      [USER],
    );
    assert.equal(rows.length, 1);
  },
);
test("missing matches do not consume the category", { skip }, async () => {
  assert.equal(await service.claimForCompletedTask(USER, "task"), null);
  await lesson("studio-nudge-later");
  assert.ok(await service.claimForCompletedTask(USER, "task"));
});
test(
  "another user, an unknown task and a skip cannot claim the nudge",
  { skip },
  async () => {
    await lesson("studio-nudge-match");
    assert.equal(await service.claimForCompletedTask(OTHER, "task"), null);
    assert.equal(await service.claimForCompletedTask(USER, "unknown"), null);
    await db.query(
      'UPDATE "programme_task_progress" SET "outcome" = $1 WHERE "userId" = $2',
      ["skipped", USER],
    );
    assert.equal(await service.claimForCompletedTask(USER, "task"), null);
  },
);
test(
  "old completion days cannot claim a new contextual nudge",
  { skip },
  async () => {
    await lesson("studio-nudge-match");
    await db.query(
      'UPDATE "programme_task_progress" SET "localDate" = "localDate" - 1 WHERE "userId" = $1',
      [USER],
    );
    assert.equal(await service.claimForCompletedTask(USER, "task"), null);
  },
);

test('a different task in the same category never re-shows; another category can still show', { skip }, async () => {
  await lesson('studio-nudge-video');
  await lesson('studio-nudge-photo', 'photo');
  assert.ok(await service.claimForCompletedTask(USER, 'task'));
  await db.query('UPDATE "programme_task_progress" SET "taskId" = $1 WHERE "userId" = $2', ['second-task', USER]);
  await db.query('UPDATE "programme_day_serve" SET "taskId" = $1 WHERE "userId" = $2', ['second-task', USER]);
  assert.equal(await service.claimForCompletedTask(USER, 'second-task'), null);
  await db.query('UPDATE "programme_task_progress" SET "contentType" = $1 WHERE "userId" = $2', ['photo', USER]);
  assert.equal((await service.claimForCompletedTask(USER, 'second-task'))?.category, 'photo');
});
