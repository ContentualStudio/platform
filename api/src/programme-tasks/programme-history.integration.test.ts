import "reflect-metadata";
import * as assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import type { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import { ProgrammeHistoryService } from "./programme-history.service";

// Real enrolment and progress tables, so the reads and the ledger-key join are
// what is under test. The content mirror is stubbed; it has its own suites.
const USER_ID = "programme-history-user";
const OTHER_USER_ID = "programme-history-other-user";
const USERS = [USER_ID, OTHER_USER_ID];

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "History",
  onboardingCompleted: true,
};

const tasks = [1, 2, 3, 4].map(
  (day) => ({ id: `task-${day}`, dayNumber: day }) as ProgrammeTask,
);

let dataSource: DataSource;

function buildService() {
  const contentReader = {
    findProgramme: async () => ({ title: "Growth", track: "grow" }),
    tasksForProgramme: async () => tasks,
    tasksForProgrammeVersion: async () => tasks,
  } as unknown as ProgrammeContentReader;

  return new ProgrammeHistoryService(
    dataSource,
    new ProgrammeEnrolmentService(dataSource, contentReader),
    contentReader,
  );
}

async function enrol(
  userId: string,
  status: "active" | "completed",
  startedAt: string,
): Promise<string> {
  const id = randomUUID();

  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("id", "userId", "programmeSlug", "status", "startedAt", "currentDay",
        "durationDays", "day1ScheduledFor", "completedAt")
     VALUES ($1, $2, 'growth', $3, $4, 1, 4, $5, $6)`,
    [
      id,
      userId,
      status,
      startedAt,
      startedAt.slice(0, 10),
      status === "completed" ? startedAt : null,
    ],
  );

  return id;
}

async function complete(
  userId: string,
  ledgerKey: string,
  day: number,
  outcome: "completed" | "skipped" = "completed",
) {
  await dataSource.query(
    `INSERT INTO "programme_task_progress"
       ("assignmentId", "userId", "programmeId", "taskId", "outcome",
        "weekIndex", "contentType", "localDate")
     VALUES ($1, $2, 'growth', $3, $4, 1, 'reel', $5)`,
    [ledgerKey, userId, `task-${day}`, outcome, `2026-09-0${day}`],
  );
}

async function clear() {
  for (const table of ["programme_task_progress", "programme_enrolment"]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1)`, [
      USERS,
    ]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [USERS]);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  await clear();
  for (const id of USERS) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
      [id, id, `${id}@example.test`],
    );
  }
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await clear();
  await dataSource.destroy();
});

test("each journey gets its own completion from its own ledger rows", { skip }, async () => {
  const first = await enrol(USER_ID, "completed", "2026-08-01T08:00:00Z");
  const second = await enrol(USER_ID, "active", "2026-09-01T08:00:00Z");

  for (const day of [1, 2, 3, 4]) {
    await complete(USER_ID, first, day);
  }
  await complete(USER_ID, second, 1);

  const history = await buildService().forUser(user);

  assert.deepEqual(
    history.inProgress.map((entry) => [entry.enrolmentId, entry.completionPercent]),
    [[second, 25]],
  );
  assert.deepEqual(
    history.past.map((entry) => [entry.enrolmentId, entry.completionPercent]),
    [[first, 100]],
  );
});

test("another user's enrolments and progress are never read", { skip }, async () => {
  const theirs = await enrol(OTHER_USER_ID, "active", "2026-09-01T08:00:00Z");
  await complete(OTHER_USER_ID, theirs, 1);

  assert.deepEqual(await buildService().forUser(user), {
    inProgress: [],
    past: [],
  });
});

test("skipped days do not count towards completion", { skip }, async () => {
  const journey = await enrol(USER_ID, "active", "2026-09-01T08:00:00Z");
  await complete(USER_ID, journey, 1);
  await complete(USER_ID, journey, 2, "skipped");

  const [entry] = (await buildService().forUser(user)).inProgress;

  assert.equal(entry?.completedDays, 1);
});
