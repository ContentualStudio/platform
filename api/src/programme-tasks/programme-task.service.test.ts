import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import { tasksForWeek } from "../challenge-setup/programmes/programme-task-content";
import { localDateFor } from "../common/timezone";
import { ContentEventBatch } from "../content-engine/event-batch";
import {
  createTransactionHarness,
  fakeDispatcher,
  fakeEmitter,
  queryRouter,
} from "../content-engine/testing/content-event-fakes";
import { ProgrammeTaskService } from "./programme-task.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

const PROGRAMME_ID = "15-day-jumpstart";
const FIRST_TASK_ID = `${PROGRAMME_ID}-day-1`;
const WEEK1_TASK_COUNT = tasksForWeek(PROGRAMME_ID, 1).length;
const TODAY = localDateFor(new Date(), "UTC");
const RECORDED_AT = new Date("2026-01-02T03:04:05.000Z");

interface ManagerOptions {
  setup?: {
    assignedProgrammeId: string | null;
    assignedProgrammeAssignmentId?: string | null;
    assignedProgrammeVersionId?: string | null;
    programmeStartedAt: Date | null;
  } | null;
  profile?: { timezone?: string } | null;
  taskProgressInserted?: boolean;
  weekCompletions?: number;
  weekCompletionInserted?: boolean;
  lifetimeCompletions?: number;
  skipCount?: number;
  progressRows?: { taskId: string; outcome: string; localDate: string }[];
}

// The enrolment is now what the service resolves the journey from; the setup
// row stays only as the questionnaire's record.
function resolveSetup(options: ManagerOptions) {
  return options.setup === undefined
    ? {
        assignedProgrammeId: PROGRAMME_ID,
        assignedProgrammeAssignmentId: "assignment-1",
        assignedProgrammeVersionId: `${PROGRAMME_ID}-v1`,
        programmeStartedAt: new Date(),
      }
    : options.setup
      ? { assignedProgrammeAssignmentId: "assignment-1", ...options.setup }
      : null;
}

function fakeEnrolments(options: ManagerOptions = {}) {
  const setup = resolveSetup(options);
  const active =
    setup?.assignedProgrammeId && setup.programmeStartedAt
      ? {
          id: "enrolment-1",
          userId: "user-1",
          programmeSlug: setup.assignedProgrammeId,
          programmeVersionId: setup.assignedProgrammeVersionId ?? null,
          assignmentId: setup.assignedProgrammeAssignmentId ?? null,
          status: "active",
          startedAt: new Date(),
          currentDay: 1,
          lastServedDay: null,
          durationDays: 15,
          day1ScheduledFor: TODAY,
          completedAt: null,
          abandonedAt: null,
        }
      : null;

  return { findActiveForUser: async () => active };
}

function buildManager(options: ManagerOptions = {}) {
  const query = queryRouter([
    {
      match: (sql) => sql.includes('INSERT INTO "programme_task_progress"'),
      handle: () =>
        options.taskProgressInserted === false
          ? [[], 0]
          : [{ id: "row-1", recordedAt: RECORDED_AT }],
    },
    {
      // The card's opening state: everything this assignment has resolved.
      match: (sql) => sql.includes('SELECT "taskId", "outcome"'),
      handle: () =>
        (options.progressRows ?? []).map((row) => ({
          ...row,
          recordedAt: RECORDED_AT,
        })),
    },
    {
      // The read-back a losing insert falls through to.
      match: (sql) =>
        sql.includes('FROM "programme_task_progress"') &&
        sql.includes('"outcome" = $3'),
      handle: (_sql, params) => [
        {
          outcome: params[2],
          localDate: params[3],
          recordedAt: RECORDED_AT,
        },
      ],
    },
    {
      match: (sql) => sql.includes('COUNT(DISTINCT "taskId")'),
      handle: () => [{ count: String(options.weekCompletions ?? 0) }],
    },
    {
      match: (sql) => sql.includes('INSERT INTO "programme_week_completion"'),
      handle: () =>
        options.weekCompletionInserted === false ? [[], 0] : [{ id: "week-1" }],
    },
    {
      match: (sql) => sql.includes('COUNT(DISTINCT ("programmeId", "taskId"))'),
      handle: () => [{ count: String(options.lifetimeCompletions ?? 1) }],
    },
    {
      match: (sql) => sql.includes(`"outcome" = 'skipped'`),
      handle: () => [{ count: String(options.skipCount ?? 1) }],
    },
  ]);

  // The service reads only the profile through the entity manager now; the
  // journey comes from the enrolment fake.
  const findOneBy = async () => options.profile ?? null;

  return { query, findOneBy };
}

function fakeGamification() {
  const calls: unknown[] = [];
  return {
    calls,
    recordTaskCompletion: async (
      _manager: unknown,
      _batch: ContentEventBatch,
      input: unknown,
    ) => {
      calls.push(input);
    },
  };
}

function buildService(
  managerOptions: ManagerOptions = {},
  contentReader = staticProgrammeContentReader,
) {
  const harness = createTransactionHarness(buildManager(managerOptions));
  const emitter = fakeEmitter();
  const dispatcher = fakeDispatcher({ isTransactionOpen: harness.isTransactionOpen });
  const gamification = fakeGamification();

  const service = new ProgrammeTaskService(
    harness.dataSource as never,
    emitter as never,
    dispatcher as never,
    gamification as never,
    fakeEnrolments(managerOptions) as never,
    contentReader,
  );

  return { service, emitter, dispatcher, gamification };
}

test("lists tasks only for the authenticated user's assigned started programme", async () => {
  const { service } = buildService();

  const tasks = await service.listTasks(user);

  assert.deepEqual(
    tasks.map((task) => task.id),
    [
      "15-day-jumpstart-day-1",
      "15-day-jumpstart-day-2",
      "15-day-jumpstart-day-3",
      "15-day-jumpstart-day-4",
      "15-day-jumpstart-day-5",
      "15-day-jumpstart-day-6",
      "15-day-jumpstart-day-7",
      "15-day-jumpstart-day-8",
      "15-day-jumpstart-day-9",
      "15-day-jumpstart-day-10",
      "15-day-jumpstart-day-11",
      "15-day-jumpstart-day-12",
      "15-day-jumpstart-day-13",
      "15-day-jumpstart-day-14",
      "15-day-jumpstart-day-15",
    ],
  );
});

test("rejects a live task with no authored content type", async () => {
  const original = await staticProgrammeContentReader.findProgrammeTask(
    PROGRAMME_ID,
    FIRST_TASK_ID,
  );
  assert.ok(original);
  const reader = {
    ...staticProgrammeContentReader,
    findProgrammeTaskForVersion: async () => ({
      ...original,
      contentType: "",
    }),
  };

  const { service } = buildService({}, reader);

  await assert.rejects(
    () => service.completeTask(user, FIRST_TASK_ID),
    /PROGRAMME_CONTENT_INVALID|content type/i,
  );
});

test("completing a task emits task.completed and calls gamification with lifetime completions", async () => {
  const { service, emitter, dispatcher, gamification } = buildService({
    weekCompletions: 1,
    lifetimeCompletions: 4,
  });

  const result = await service.completeTask(user, FIRST_TASK_ID);

  assert.equal(result.recorded, true);
  assert.deepEqual(emitter.emitted, [
    {
      eventId: `${eventNameTokens.taskCompleted}:user-1:${PROGRAMME_ID}:${FIRST_TASK_ID}:${TODAY}:assignment-1`,
      eventName: eventNameTokens.taskCompleted,
      payload: {
        userId: "user-1",
        programmeId: PROGRAMME_ID,
        taskId: FIRST_TASK_ID,
        contentType: "video",
        programmeVersionId: `${PROGRAMME_ID}-v1`,
      },
    },
  ]);
  assert.deepEqual(gamification.calls, [
    { userId: "user-1", localDate: TODAY, lifetimeTaskCompletions: 4 },
  ]);
  assert.equal(dispatcher.sawOpenTransaction, false);
  assert.deepEqual(dispatcher.dispatched, [emitter.emitted[0]?.eventId]);
});

test("finishing the last task of a week also emits week.completed, cause before effect", async () => {
  const { service, emitter } = buildService({
    weekCompletions: WEEK1_TASK_COUNT,
    weekCompletionInserted: true,
  });

  await service.completeTask(user, FIRST_TASK_ID);

  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.taskCompleted, eventNameTokens.weekCompleted],
  );
  assert.deepEqual(emitter.emitted[1]?.payload, {
    userId: "user-1",
    programmeId: PROGRAMME_ID,
    weekIndex: 1,
  });
});

test("losing the week-completion race emits task.completed only", async () => {
  const { service, emitter } = buildService({
    weekCompletions: WEEK1_TASK_COUNT,
    weekCompletionInserted: false,
  });

  await service.completeTask(user, FIRST_TASK_ID);

  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.taskCompleted],
  );
});

test("a replayed completion (lost gate) emits nothing and touches no gamification", async () => {
  const { service, emitter, gamification } = buildService({
    taskProgressInserted: false,
  });

  const result = await service.completeTask(user, FIRST_TASK_ID);

  assert.equal(result.recorded, false);
  assert.deepEqual(emitter.emitted, []);
  assert.deepEqual(gamification.calls, []);
});

test("completing with no programme under way throws NO_ACTIVE_PROGRAMME", async () => {
  const { service } = buildService({ setup: null });

  await assert.rejects(
    () => service.completeTask(user, FIRST_TASK_ID),
    /NO_ACTIVE_PROGRAMME|No programme is currently under way/,
  );
});

test("completing before the programme has started throws NO_ACTIVE_PROGRAMME", async () => {
  const { service } = buildService({
    setup: { assignedProgrammeId: PROGRAMME_ID, programmeStartedAt: null },
  });

  await assert.rejects(
    () => service.completeTask(user, FIRST_TASK_ID),
    /NO_ACTIVE_PROGRAMME|No programme is currently under way/,
  );
});

test("completing an unknown task throws UNKNOWN_TASK", async () => {
  const { service } = buildService();

  await assert.rejects(
    () => service.completeTask(user, "not-a-real-task"),
    /UNKNOWN_TASK|does not belong/,
  );
});

test("skipping a task emits task.skipped with the post-insert skip count and never touches gamification", async () => {
  const { service, emitter, gamification } = buildService({ skipCount: 3 });

  const result = await service.skipTask(user, FIRST_TASK_ID);

  assert.equal(result.recorded, true);
  assert.deepEqual(emitter.emitted, [
    {
      eventId: `${eventNameTokens.taskSkipped}:user-1:${PROGRAMME_ID}:${FIRST_TASK_ID}:${TODAY}:assignment-1`,
      eventName: eventNameTokens.taskSkipped,
      payload: {
        userId: "user-1",
        programmeId: PROGRAMME_ID,
        taskId: FIRST_TASK_ID,
        consecutiveSkipCount: 3,
        programmeVersionId: `${PROGRAMME_ID}-v1`,
      },
    },
  ]);
  assert.deepEqual(gamification.calls, []);
});

test("a replayed skip (lost gate) emits nothing", async () => {
  const { service, emitter } = buildService({ taskProgressInserted: false });

  const result = await service.skipTask(user, FIRST_TASK_ID);

  assert.equal(result.recorded, false);
  assert.deepEqual(emitter.emitted, []);
});

test("a resolved outcome carries the record the card renders", async () => {
  const { service } = buildService({ lifetimeCompletions: 1 });

  const result = await service.completeTask(user, FIRST_TASK_ID);

  assert.deepEqual(result.progress, {
    taskId: FIRST_TASK_ID,
    outcome: "completed",
    localDate: TODAY,
    recordedAt: RECORDED_AT.toISOString(),
  });
});

test("a replayed completion resolves to the event already on record", async () => {
  const { service } = buildService({ taskProgressInserted: false });

  const result = await service.completeTask(user, FIRST_TASK_ID);

  assert.equal(result.recorded, false);
  assert.deepEqual(result.progress, {
    taskId: FIRST_TASK_ID,
    outcome: "completed",
    localDate: TODAY,
    recordedAt: RECORDED_AT.toISOString(),
  });
});

test("progress lists the assignment's recorded outcomes", async () => {
  const { service } = buildService({
    progressRows: [
      { taskId: FIRST_TASK_ID, outcome: "completed", localDate: TODAY },
      { taskId: `${PROGRAMME_ID}-day-2`, outcome: "skipped", localDate: TODAY },
    ],
  });

  assert.deepEqual(await service.listProgress(user), [
    {
      taskId: FIRST_TASK_ID,
      outcome: "completed",
      localDate: TODAY,
      recordedAt: RECORDED_AT.toISOString(),
    },
    {
      taskId: `${PROGRAMME_ID}-day-2`,
      outcome: "skipped",
      localDate: TODAY,
      recordedAt: RECORDED_AT.toISOString(),
    },
  ]);
});

test("progress with no programme under way throws NO_ACTIVE_PROGRAMME", async () => {
  const { service } = buildService({ setup: null });

  await assert.rejects(
    () => service.listProgress(user),
    /NO_ACTIVE_PROGRAMME|No programme is currently under way/,
  );
});
