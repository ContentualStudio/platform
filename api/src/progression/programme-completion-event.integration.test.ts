import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import databaseConfig from "../config/database.config";
import appDataSource from "../database/data-source";
import { ProgrammeCompletion1784720000000 } from "../database/migrations/1784720000000-ProgrammeCompletion";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import { ProgressionService } from "./progression.service";
import { noopProductAnalytics } from "../observability/product-analytics.port";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "programme-completion-event-user";
const PROGRAMME_A = "30-day-foundation";
const PROGRAMME_B = "30-day-growth";

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Completion Event",
  onboardingCompleted: true,
};

let dataSource: DataSource;

const evaluator: ContentEventEvaluator = { evaluate: async () => {} };

function buildService() {
  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );

  return {
    service: new ProgressionService(
      dataSource,
      emitter,
      dispatcher,
      new ProgrammeEnrolmentService(dataSource, staticProgrammeContentReader),
    ),
  };
}

// Completion finishes the active enrolment, so starting a programme here
// means opening one, as well as recording it on the setup row.
async function startEnrolment(programmeId: string) {
  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("userId", "programmeSlug", "programmeVersionId", "status", "startedAt",
        "currentDay", "durationDays", "day1ScheduledFor")
     VALUES ($1, $2, $3, 'active', now(), 1, 30, current_date)`,
    // Pinned, as a matched journey is: the completion event carries it.
    [USER_ID, programmeId, `${programmeId}-v1`],
  );
}

async function assignProgramme(programmeId: string) {
  await dataSource.query(
    `UPDATE "challenge_setup"
       SET "assignedProgrammeId" = $2, "programmeStartedAt" = now(), "programmeCompletedAt" = NULL
     WHERE "userId" = $1`,
    [USER_ID, programmeId],
  );
  await startEnrolment(programmeId);
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

  for (const table of [
    "content_engine_events",
    "programme_completion",
    "programme_enrolment",
    "challenge_setup",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);

  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "challenge_setup"
       ("userId", "setupCompletedAt", "assignedProgrammeId", "programmeAssignedAt", "programmeStartedAt")
     VALUES ($1, now(), $2, now(), now())`,
    [USER_ID, PROGRAMME_A],
  );
  await startEnrolment(PROGRAMME_A);
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  for (const table of [
    "content_engine_events",
    "programme_completion",
    "programme_enrolment",
    "challenge_setup",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("the first completion writes ordinal 1 and emits both events", { skip }, async () => {
  const { service } = buildService();

  const result = await service.completeProgramme(user);
  assert.equal(result.recorded, true);

  // Keyed by name: both rows share one transaction's `now()`, so their
  // `createdAt` ties and gives no order.
  const rows = (await dataSource.query(
    `SELECT "eventName", "payload" FROM "content_engine_events"
     WHERE "userId" = $1`,
    [USER_ID],
  )) as { eventName: string; payload: Record<string, unknown> }[];
  const payloads = new Map(rows.map((row) => [row.eventName, row.payload]));

  assert.equal(rows.length, 2);
  assert.deepEqual(payloads.get(eventNameTokens.programmeCompleted), {
    userId: USER_ID,
    programmeId: PROGRAMME_A,
    programmeVersionId: `${PROGRAMME_A}-v1`,
  });
  assert.deepEqual(payloads.get(eventNameTokens.programmeCountReached), {
    userId: USER_ID,
    count: 1,
  });

  const [setup] = (await dataSource.query(
    `SELECT "programmeCompletedAt" FROM "challenge_setup" WHERE "userId" = $1`,
    [USER_ID],
  )) as { programmeCompletedAt: Date | null }[];
  assert.ok(setup?.programmeCompletedAt);
});

test("replaying the same completion twice writes one row", { skip }, async () => {
  const { service } = buildService();

  await service.completeProgramme(user);

  // The first completion closes the enrolment, so a replay finds no journey
  // under way and is refused rather than recorded again.
  await assert.rejects(() => service.completeProgramme(user), {
    response: { code: "NO_ACTIVE_PROGRAMME", message: "No programme is currently under way." },
  });

  const rows = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "programme_completion" WHERE "userId" = $1`,
    [USER_ID],
  );
  assert.equal(Number(rows[0].count), 1);
});

test("completing a second, different programme mints ordinal 2", { skip }, async () => {
  const { service } = buildService();

  await service.completeProgramme(user);
  await assignProgramme(PROGRAMME_B);
  const second = await service.completeProgramme(user);

  assert.equal(second.recorded, true);

  const rows = (await dataSource.query(
    `SELECT "eventName", "payload" FROM "content_engine_events"
     WHERE "userId" = $1 AND "eventName" = $2 ORDER BY "createdAt"`,
    [USER_ID, eventNameTokens.programmeCountReached],
  )) as { payload: Record<string, unknown> }[];

  assert.deepEqual(
    rows.map((row) => row.payload.count),
    [1, 2],
  );
});

test(
  "the migration is reversible and round-trips the completion table",
  { skip },
  async () => {
    const migration = new ProgrammeCompletion1784720000000();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    // Always rolled back: replaying an old migration on the shared test
    // database would otherwise drop every column later migrations added.
    await runner.startTransaction();

    try {
      await migration.down(runner);
      assert.equal(await runner.hasTable("programme_completion"), false);
      const table = await runner.getTable("challenge_setup");
      assert.equal(
        table?.columns.some((column) => column.name === "programmeCompletedAt"),
        false,
      );

      await migration.up(runner);
      assert.equal(await runner.hasTable("programme_completion"), true);
      const restored = await runner.getTable("challenge_setup");
      assert.equal(
        restored?.columns.some((column) => column.name === "programmeCompletedAt"),
        true,
      );

      await runner.query(
        `INSERT INTO "programme_completion" ("userId", "programmeId", "completionOrdinal")
         VALUES ($1, $2, 1)`,
        [USER_ID, PROGRAMME_A],
      );

      await assert.rejects(
        () =>
          runner.query(
            `INSERT INTO "programme_completion" ("userId", "programmeId", "completionOrdinal")
             VALUES ($1, $2, 1)`,
            [USER_ID, "another-programme"],
          ),
        /UQ_programme_completion_user_ordinal/,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  },
);
