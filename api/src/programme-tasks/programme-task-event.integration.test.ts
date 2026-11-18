import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import databaseConfig from "../config/database.config";
// Imported for its module side effect: it populates process.env from
// .env.local / .env, so databaseConfig() below reports the developer's real
// DATABASE_URL rather than the built-in fallback.
import appDataSource from "../database/data-source";
import { ProgrammeTaskProgress1784700000000 } from "../database/migrations/1784700000000-ProgrammeTaskProgress";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import { GamificationService } from "../gamification/gamification.service";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import { ProgrammeTaskService } from "./programme-task.service";
import { noopProductAnalytics } from "../observability/product-analytics.port";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "programme-task-event-user";
const PROGRAMME_ID = "15-day-jumpstart";
const PROGRAMME_VERSION_ID = `${PROGRAMME_ID}-v1`;
const LAST_TASK_ID = `${PROGRAMME_ID}-day-15`; // the only task in week 3

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Task Event",
  onboardingCompleted: true,
};

let dataSource: DataSource;
// The active journey's ledger key: progress rows are filed under it.
let enrolmentId: string;
let evaluatorBehaviour: (eventId: string) => void = () => {};

const evaluator: ContentEventEvaluator = {
  evaluate: async (event) => {
    evaluatorBehaviour(event.id);
  },
};

function buildService() {
  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );
  const gamification = new GamificationService(emitter);

  return {
    dispatcher,
    service: new ProgrammeTaskService(
      dataSource,
      emitter,
      dispatcher,
      gamification,
      new ProgrammeEnrolmentService(dataSource, staticProgrammeContentReader),
      staticProgrammeContentReader,
    ),
  };
}

async function outboxRows() {
  return (await dataSource.query(
    `SELECT "id", "eventName", "status" FROM "content_engine_events"
     WHERE "userId" = $1 ORDER BY "createdAt"`,
    [USER_ID],
  )) as { id: string; eventName: string; status: string }[];
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

before(async () => {
  if (skip) {
    return;
  }

  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  evaluatorBehaviour = () => {};

  for (const table of [
    "content_engine_events",
    "programme_task_progress",
    "programme_week_completion",
    "user_streak",
    "user_level",
    "programme_enrolment",
    "challenge_setup",
    "user_profile",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);

  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "user_profile" ("userId", "timezone") VALUES ($1, $2)`,
    [USER_ID, "UTC"],
  );
  await dataSource.query(
    `INSERT INTO "programme_content_versions"
       ("programmeVersionId", "programmeKey", "sourceDocumentId",
        "sourceUpdatedAt", "contentHash", "snapshot")
     VALUES ($1, $2, $3, now(), $4, '{}'::jsonb)
     ON CONFLICT ("programmeVersionId") DO NOTHING`,
    [
      PROGRAMME_VERSION_ID,
      PROGRAMME_ID,
      `integration-${PROGRAMME_ID}`,
      `hash-${PROGRAMME_VERSION_ID}`,
    ],
  );
  await dataSource.query(
    `INSERT INTO "challenge_setup"
       ("userId", "setupCompletedAt", "assignedProgrammeId", "assignedProgrammeVersionId", "programmeAssignedAt", "programmeStartedAt")
     VALUES ($1, now(), $2, $3, now(), now())`,
    [USER_ID, PROGRAMME_ID, PROGRAMME_VERSION_ID],
  );
  // Tasks resolve from the active enrolment, not the setup row.
  const [enrolment] = (await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("userId", "programmeSlug", "programmeVersionId", "status", "startedAt",
        "currentDay", "durationDays", "day1ScheduledFor")
     VALUES ($1, $2, $3, 'active', now(), 1, 15, current_date)
     RETURNING "id"`,
    [USER_ID, PROGRAMME_ID, PROGRAMME_VERSION_ID],
  )) as { id: string }[];
  enrolmentId = enrolment!.id;
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  for (const table of [
    "content_engine_events",
    "programme_task_progress",
    "programme_week_completion",
    "user_streak",
    "user_level",
    "programme_enrolment",
    "challenge_setup",
    "user_profile",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test(
  "one completion that finishes a week, extends a streak and promotes a level produces four events from one commit",
  { skip },
  async () => {
    // Nine prior lifetime completions across other tasks, so the tenth (this
    // one) crosses the Silver threshold.
    for (let index = 0; index < 9; index += 1) {
      await dataSource.query(
        `INSERT INTO "programme_task_progress"
           ("assignmentId", "userId", "programmeId", "taskId", "outcome", "weekIndex", "contentType", "localDate")
         VALUES ($5, $1, $2, $3, 'completed', 1, 'video', $4::date)`,
        [USER_ID, PROGRAMME_ID, `seed-task-${index}`, isoDaysAgo(10), enrolmentId],
      );
    }

    // A streak already active as of yesterday, so today's completion extends
    // it rather than seeding a fresh one.
    await dataSource.query(
      `INSERT INTO "user_streak"
         ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength", "runOrdinal")
       VALUES ($1, $2::date, $2::date, 1, 1, 1)`,
      [USER_ID, isoDaysAgo(1)],
    );

    const { service, dispatcher } = buildService();

    // The evaluator is not registered in production either; failing it here
    // simulates that and proves every event lands pending from one commit
    // before anything is delivered.
    evaluatorBehaviour = () => {
      throw new Error("evaluator is not registered");
    };

    const result = await service.completeTask(user, LAST_TASK_ID);
    assert.equal(result.recorded, true);

    // Sorted: all four share one transaction's `now()`, so `createdAt` ties.
    const rows = await outboxRows();
    assert.deepEqual(
      rows.map((row) => row.eventName).sort(),
      [
        eventNameTokens.taskCompleted,
        eventNameTokens.weekCompleted,
        eventNameTokens.streakReached,
        eventNameTokens.levelChanged,
      ].sort(),
    );
    assert.ok(
      rows.every((row) => row.status === "pending"),
      "a failed evaluator must leave every row pending",
    );

    // Bring the backoff forward and let the retry succeed.
    await dataSource.query(
      `UPDATE "content_engine_events" SET "availableAt" = now() - interval '1 minute'
       WHERE "userId" = $1`,
      [USER_ID],
    );
    evaluatorBehaviour = () => {};
    const results = await dispatcher.dispatchPending(25);
    assert.equal(results.length, 4);
    assert.ok(results.every((r) => r.delivered));

    const delivered = await outboxRows();
    assert.ok(delivered.every((row) => row.status === "delivered"));
  },
);

test("replaying the same completion twice records the fact once", { skip }, async () => {
  const { service } = buildService();

  const first = await service.completeTask(user, LAST_TASK_ID);
  const second = await service.completeTask(user, LAST_TASK_ID);

  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);

  const rows = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "programme_task_progress" WHERE "userId" = $1`,
    [USER_ID],
  );
  assert.equal(Number(rows[0].count), 1);
});

test("completing an unassigned/unstarted task is rejected before any write", { skip }, async () => {
  // "Under way" is the active enrolment now, not the setup row's start time.
  await dataSource.query(
    `UPDATE "challenge_setup" SET "programmeStartedAt" = NULL WHERE "userId" = $1`,
    [USER_ID],
  );
  await dataSource.query(`DELETE FROM "programme_enrolment" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  const { service } = buildService();

  await assert.rejects(() => service.completeTask(user, LAST_TASK_ID), {
    response: { code: "NO_ACTIVE_PROGRAMME", message: "No programme is currently under way." },
  });

  const rows = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "programme_task_progress" WHERE "userId" = $1`,
    [USER_ID],
  );
  assert.equal(Number(rows[0].count), 0);
});

test(
  "the migration is reversible and round-trips its tables",
  { skip },
  async () => {
    const migration = new ProgrammeTaskProgress1784700000000();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    // Always rolled back: replaying an old migration on the shared test
    // database would otherwise drop every column later migrations added.
    await runner.startTransaction();

    try {
      await migration.down(runner);
      assert.equal(await runner.hasTable("programme_task_progress"), false);
      assert.equal(await runner.hasTable("programme_week_completion"), false);

      await migration.up(runner);
      assert.equal(await runner.hasTable("programme_task_progress"), true);
      assert.equal(await runner.hasTable("programme_week_completion"), true);

      await runner.query(
        `INSERT INTO "programme_task_progress"
           ("userId", "programmeId", "taskId", "outcome", "weekIndex", "contentType", "localDate")
         VALUES ($1, $2, $3, 'completed', 1, 'video', now()::date)`,
        [USER_ID, PROGRAMME_ID, "round-trip-task"],
      );

      await assert.rejects(
        () =>
          runner.query(
            `UPDATE "programme_task_progress" SET "outcome" = 'invented'
             WHERE "userId" = $1`,
            [USER_ID],
          ),
        /CHK_programme_task_progress_outcome/,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  },
);
