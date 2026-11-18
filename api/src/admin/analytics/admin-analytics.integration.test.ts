import "reflect-metadata";
import * as assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import type { ProgrammeContentReader } from "../../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../../challenge-setup/programmes/programme-task-content";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../../database/testing/test-data-source";
import { AdminAnalyticsService } from "./admin-analytics.service";

// Real enrolment, progress and programme tables, so the latest-journey pick
// and the ledger-key join are what is under test. Task content is stubbed (it
// has its own suites): every programme here is four one-task days. The shared
// test database may hold other suites' rows, so assertions read only this
// suite's programmes.
const TOKEN = "zzanalytics";
const PUBLISHED = `${TOKEN}-published`;
const EMPTY = `${TOKEN}-empty`;
const RETIRED = `${TOKEN}-retired`;
const USERS = ["a", "b", "c", "d"].map((suffix) => `${TOKEN}-user-${suffix}`);

const tasks = [1, 2, 3, 4].map(
  (day) => ({ id: `task-${day}`, dayNumber: day }) as ProgrammeTask,
);

let dataSource: DataSource;

function service() {
  const contentReader = {
    tasksForProgramme: async () => tasks,
    tasksForProgrammeVersion: async () => tasks,
  } as unknown as ProgrammeContentReader;

  return new AdminAnalyticsService(dataSource, contentReader);
}

async function enrol(
  userId: string,
  slug: string,
  status: "active" | "completed" | "abandoned",
  startedAt: string,
): Promise<string> {
  const id = randomUUID();

  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("id", "userId", "programmeSlug", "status", "startedAt", "currentDay",
        "durationDays", "day1ScheduledFor", "completedAt", "abandonedAt")
     VALUES ($1, $2, $3, $4, $5, 1, 4, $6, $7, $8)`,
    [
      id,
      userId,
      slug,
      status,
      startedAt,
      startedAt.slice(0, 10),
      status === "completed" ? startedAt : null,
      status === "abandoned" ? startedAt : null,
    ],
  );

  return id;
}

async function completeDays(userId: string, ledgerKey: string, days: number[]) {
  for (const day of days) {
    await dataSource.query(
      `INSERT INTO "programme_task_progress"
         ("assignmentId", "userId", "programmeId", "taskId", "outcome",
          "weekIndex", "contentType", "localDate")
       VALUES ($1, $2, $3, $4, 'completed', 1, 'reel', $5)`,
      [ledgerKey, userId, PUBLISHED, `task-${day}`, `2026-09-0${day}`],
    );
  }
}

async function clear() {
  for (const table of ["programme_task_progress", "programme_enrolment"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1)`, [USERS]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [USERS]);
  await dataSource.query(`DELETE FROM "programme" WHERE "slug" = ANY($1)`, [
    [PUBLISHED, EMPTY],
  ]);
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  await clear();

  for (const id of USERS) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)`,
      [id, `${id}@example.test`],
    );
  }
  for (const [slug, title] of [
    [PUBLISHED, "Published Programme"],
    [EMPTY, "Nobody Started This"],
  ]) {
    await dataSource.query(
      `INSERT INTO "programme" ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title")
       VALUES ($1, now(), now(), $2, $3)`,
      [`${slug}-doc`, slug, title],
    );
  }

  const [a, b, c, d] = USERS as [string, string, string, string];

  // a: finished once (4/4), then restarted and is 1 day in. Counts once, as
  // active at 25% — the most recent journey is the one that counts.
  const aFirst = await enrol(a, PUBLISHED, "completed", "2026-07-01T08:00:00Z");
  await completeDays(a, aFirst, [1, 2, 3, 4]);
  const aSecond = await enrol(a, PUBLISHED, "active", "2026-09-01T08:00:00Z");
  await completeDays(a, aSecond, [1]);

  // b: completed with every day done.
  const bJourney = await enrol(b, PUBLISHED, "completed", "2026-08-01T08:00:00Z");
  await completeDays(b, bJourney, [1, 2, 3, 4]);

  // c: dropped off after two days.
  const cJourney = await enrol(c, PUBLISHED, "abandoned", "2026-08-15T08:00:00Z");
  await completeDays(c, cJourney, [1, 2]);

  // d: a journey on a programme that has since left the mirror.
  await enrol(d, RETIRED, "abandoned", "2026-06-01T08:00:00Z");
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await clear();
  await dataSource.destroy();
});

test("counts each user's latest journey and averages the shared completion %", { skip }, async () => {
  const report = await service().programmeCompletion();
  const row = report.programmes.find((programme) => programme.slug === PUBLISHED);

  // a 25%, b 100%, c 50% → 58.3.
  assert.deepEqual(row, {
    slug: PUBLISHED,
    title: "Published Programme",
    participants: 3,
    active: 1,
    completed: 1,
    droppedOff: 1,
    averageCompletion: 58.3,
  });
});

test("a published programme nobody started reports zeros, not an average", { skip }, async () => {
  const report = await service().programmeCompletion();

  assert.deepEqual(
    report.programmes.find((programme) => programme.slug === EMPTY),
    {
      slug: EMPTY,
      title: "Nobody Started This",
      participants: 0,
      active: 0,
      completed: 0,
      droppedOff: 0,
      averageCompletion: null,
    },
  );
});

test("journeys on an unpublished programme keep their slug with no title", { skip }, async () => {
  const report = await service().programmeCompletion();
  const retired = report.programmes.find((programme) => programme.slug === RETIRED);

  assert.equal(retired?.title, null);
  assert.equal(retired?.droppedOff, 1);
});
