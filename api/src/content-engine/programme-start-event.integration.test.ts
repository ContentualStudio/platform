import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ChallengeSetupService } from "../challenge-setup/challenge-setup.service";
import { ProgrammeAssignmentRepository } from "../challenge-setup/programmes/programme-assignment.repository";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import databaseConfig from "../config/database.config";
// Imported for its module side effect: it populates process.env from
// .env.local / .env, so databaseConfig() below reports the developer's real
// DATABASE_URL rather than the built-in fallback. Without it the guard would
// compare TEST_DATABASE_URL against a URL nobody uses.
import appDataSource from "../database/data-source";
import { ContentEngineEvents1784690000000 } from "../database/migrations/1784690000000-ContentEngineEvents";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { ContentEngineEventEntity } from "./entities/content-engine-event.entity";
import { ContentEventDispatcher } from "./event-dispatcher";
import { ContentEventEmitter } from "./event-emitter";
import type { ContentEventEvaluator } from "./event-evaluator.port";
import { noopProductAnalytics } from "../observability/product-analytics.port";

// These prove what a fake repository cannot: that the fact update and the
// outbox insert are genuinely one transaction, that two concurrent starts
// produce exactly one event, and that a failed evaluator leaves a real row
// pending and retryable. They need a disposable Postgres database:
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
//
// See docs/database.md. Without the variable the whole file skips, so the
// default unit-test run stays green on a machine with no database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "programme-start-event-user";
const PROGRAMME_ID = "30-day-foundation";
const PROGRAMME_VERSION_ID = `${PROGRAMME_ID}-v1`;
const EVENT_ID = `${eventNameTokens.programmeStarted}:${USER_ID}:${PROGRAMME_ID}`;

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Programme Start",
  onboardingCompleted: true,
};

let dataSource: DataSource;

// Swapped per test so a single harness can exercise success, failure and
// recovery against the same real outbox row.
let evaluatorBehaviour: (eventId: string) => void = () => {};

const evaluator: ContentEventEvaluator = {
  evaluate: async (event) => {
    evaluatorBehaviour(event.id);
  },
};

function buildService(options: { emitter?: ContentEventEmitter } = {}) {
  const emitter = options.emitter ?? new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );

  return {
    dispatcher,
    service: new ChallengeSetupService(
      dataSource.getRepository("ChallengeSetupEntity") as never,
      dataSource.getRepository("UserProfileEntity") as never,
      // Matching never runs on these paths — the programme is assigned by the
      // fixture, not by completion — so the matcher stays a refusing stub while
      // the assignment repository is the real one.
      { match: () => undefined } as never,
      new ProgrammeAssignmentRepository(),
      dataSource,
      emitter,
      dispatcher,
      staticProgrammeContentReader,
      new ProgrammeEnrolmentService(dataSource, staticProgrammeContentReader),
      { startRefusal: async () => null } as never,
    ),
  };
}

async function outboxRows() {
  return (await dataSource.query(
    `SELECT "id", "eventName", "userId", "payload", "status", "attemptCount",
            "lastError", "createdAt", "availableAt", "deliveredAt"
     FROM "content_engine_events"
     WHERE "userId" = $1
     ORDER BY "createdAt"`,
    [USER_ID],
  )) as Record<string, unknown>[];
}

async function startedAt(): Promise<Date | null> {
  const [row] = (await dataSource.query(
    `SELECT "programmeStartedAt" FROM "challenge_setup" WHERE "userId" = $1`,
    [USER_ID],
  )) as { programmeStartedAt: Date | null }[];

  return row?.programmeStartedAt ?? null;
}

before(async () => {
  if (skip) {
    return;
  }

  // Refuses to touch anything that is not a separate, disposable database.
  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  // Reuse the application's entity/migration globs, driver and ssl handling —
  // only the target database differs.
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
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "user_profile" ("userId", "timezone") VALUES ($1, $2)`,
    [USER_ID, "Africa/Lagos"],
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
       ("userId", "setupCompletedAt", "assignedProgrammeId", "assignedProgrammeVersionId", "programmeAssignedAt")
     VALUES ($1, now(), $2, $3, now())`,
    [USER_ID, PROGRAMME_ID, PROGRAMME_VERSION_ID],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("concurrent begins produce one start transition and one event", { skip }, async () => {
  const { service } = buildService();

  const [first, second] = await Promise.all([
    service.beginProgramme(user),
    service.beginProgramme(user),
  ]);

  const rows = await outboxRows();
  assert.equal(rows.length, 1, "a race must not double-emit programme.started");
  assert.equal(rows[0].id, EVENT_ID);
  assert.equal(rows[0].eventName, eventNameTokens.programmeStarted);
  assert.deepEqual(rows[0].payload, {
    userId: USER_ID,
    programmeId: PROGRAMME_ID,
  });

  assert.notEqual(await startedAt(), null);
  // Both callers see the same committed start, and the response contract is
  // untouched by the event work.
  assert.equal(first.programmeStarted, true);
  assert.equal(second.programmeStarted, true);
  assert.equal(first.assignedProgramme?.id, PROGRAMME_ID);
  assert.ok(first.day1ScheduledFor);
});

test("replaying begin creates no second event", { skip }, async () => {
  const { service } = buildService();

  await service.beginProgramme(user);
  await service.beginProgramme(user);
  await service.beginProgramme(user);

  assert.equal((await outboxRows()).length, 1);
});

test("a failed outbox write rolls the programme start back", { skip }, async () => {
  // Fails at the point the emitter would insert, inside the real transaction.
  const emitter = {
    emit: async () => {
      throw new Error("outbox write failed");
    },
  } as unknown as ContentEventEmitter;
  const { service } = buildService({ emitter });

  await assert.rejects(() => service.beginProgramme(user), /outbox write failed/);

  assert.equal(
    await startedAt(),
    null,
    "the start must not commit without its event",
  );
  assert.equal((await outboxRows()).length, 0);
});

test(
  "a failed evaluator leaves the committed event pending and retryable",
  { skip },
  async () => {
    evaluatorBehaviour = () => {
      throw new Error("evaluator is not registered");
    };
    const { service, dispatcher } = buildService();

    // The dispatch failure is caught and logged; the response still reports the
    // committed start.
    const status = await service.beginProgramme(user);
    assert.equal(status.programmeStarted, true);
    assert.notEqual(await startedAt(), null);

    const [pending] = await outboxRows();
    assert.equal(pending.status, "pending");
    assert.equal(Number(pending.attemptCount), 1);
    assert.match(String(pending.lastError), /evaluator is not registered/);
    assert.ok(
      (pending.availableAt as Date) > (pending.createdAt as Date),
      "a failed delivery must back off before the next attempt",
    );
    assert.equal(pending.deliveredAt, null);

    // Bring the backoff forward rather than waiting 30 seconds for it.
    await dataSource.query(
      `UPDATE "content_engine_events" SET "availableAt" = now() - interval '1 minute'
       WHERE "id" = $1`,
      [EVENT_ID],
    );

    evaluatorBehaviour = () => {};
    const results = await dispatcher.dispatchPending(25);

    assert.deepEqual(
      results.filter((result) => result.eventId === EVENT_ID),
      [{ eventId: EVENT_ID, delivered: true }],
    );

    const rows = await outboxRows();
    assert.equal(rows.length, 1, "the retry must deliver the same event");
    assert.equal(rows[0].status, "delivered");
    assert.notEqual(rows[0].deliveredAt, null);
    assert.equal(Number(rows[0].attemptCount), 2);
  },
);

test("a delivered event is not redelivered by a later sweep", { skip }, async () => {
  const delivered: string[] = [];
  evaluatorBehaviour = (eventId) => {
    delivered.push(eventId);
  };
  const { service, dispatcher } = buildService();

  await service.beginProgramme(user);
  await dispatcher.dispatchPending(25);

  assert.deepEqual(delivered, [EVENT_ID]);
});

test("the outbox migration is reversible and round-trips its columns", { skip }, async () => {
  const migration = new ContentEngineEvents1784690000000();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  // Always rolled back: replaying an old migration on the shared test
  // database would otherwise drop every column later migrations added.
  await runner.startTransaction();

  try {
    await migration.down(runner);
    assert.equal(
      await runner.hasTable("content_engine_events"),
      false,
      "down must remove the outbox table",
    );

    await migration.up(runner);
    assert.equal(await runner.hasTable("content_engine_events"), true);

    const table = await runner.getTable("content_engine_events");
    const columns = (table?.columns ?? []).map((column) => column.name).sort();
    assert.deepEqual(columns, [
      "attemptCount",
      "availableAt",
      "claimToken",
      "claimedUntil",
      "createdAt",
      "deliveredAt",
      "eventName",
      "id",
      "lastError",
      "payload",
      "status",
      "userId",
    ]);

    const indexNames = (table?.indices ?? []).map((index) => index.name).sort();
    assert.deepEqual(indexNames, [
      "IDX_content_engine_events_name_created",
      "IDX_content_engine_events_pending",
    ]);

    // A real row must survive the recreated schema: jsonb payload and uuid
    // claim fields are the two that a hand-edited migration typically gets
    // wrong.
    const claimToken = "11111111-2222-3333-4444-555555555555";
    await runner.query(
      `INSERT INTO "content_engine_events"
         ("id", "eventName", "userId", "payload", "claimToken", "claimedUntil")
       VALUES ($1, $2, $3, $4::jsonb, $5, now())`,
      [
        "migration-round-trip",
        eventNameTokens.programmeStarted,
        USER_ID,
        JSON.stringify({ userId: USER_ID, programmeId: PROGRAMME_ID }),
        claimToken,
      ],
    );

    const [row] = (await runner.query(
      `SELECT "payload", "claimToken", "status", "attemptCount"
       FROM "content_engine_events" WHERE "id" = $1`,
      ["migration-round-trip"],
    )) as Record<string, unknown>[];

    assert.deepEqual(row.payload, {
      userId: USER_ID,
      programmeId: PROGRAMME_ID,
    });
    assert.equal(row.claimToken, claimToken);
    assert.equal(row.status, "pending");
    assert.equal(Number(row.attemptCount), 0);

    // The status check must survive the recreation too.
    await assert.rejects(
      () =>
        runner.query(
          `UPDATE "content_engine_events" SET "status" = 'invented' WHERE "id" = $1`,
          ["migration-round-trip"],
        ),
      /CHK_content_engine_events_status/,
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});
