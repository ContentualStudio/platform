import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  createTransactionHarness,
  fakeDispatcher,
  fakeEmitter,
  queryRouter,
} from "../content-engine/testing/content-event-fakes";
import { ProgressionService } from "./progression.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};
const PROGRAMME_ID = "30-day-foundation";

interface ManagerOptions {
  setup?: {
    assignedProgrammeId: string | null;
    assignedProgrammeAssignmentId?: string | null;
    programmeStartedAt: Date | null;
  } | null;
  insertReturnsOrdinal?: number | null; // null models a lost/replayed gate
}

function resolveSetup(options: ManagerOptions) {
  return options.setup === undefined
      ? {
          assignedProgrammeId: PROGRAMME_ID,
          assignedProgrammeAssignmentId: "assignment-1",
          programmeStartedAt: new Date(),
        }
      : options.setup
        ? { assignedProgrammeAssignmentId: "assignment-1", ...options.setup }
        : null;
}

function buildManager(options: ManagerOptions = {}) {
  const query = queryRouter([
    {
      match: (sql) => sql.includes('INSERT INTO "programme_completion"'),
      handle: () =>
        options.insertReturnsOrdinal == null
          ? [[], 0]
          : [{ completionOrdinal: options.insertReturnsOrdinal }],
    },
    {
      match: (sql) => sql.includes('UPDATE "challenge_setup" SET "programmeCompletedAt"'),
      handle: () => [[], 1],
    },
    {
      match: (sql) =>
        sql.includes('UPDATE "programme_enrolment"') &&
        sql.includes("'completed'"),
      handle: () => [[], 1],
    },
  ]);

  return { query };
}

function buildService(managerOptions: ManagerOptions = {}) {
  const harness = createTransactionHarness(buildManager(managerOptions));
  const emitter = fakeEmitter();
  const dispatcher = fakeDispatcher({ isTransactionOpen: harness.isTransactionOpen });
  const setup = resolveSetup(managerOptions);
  const enrolments = {
    // Completion resolves the journey under way, not the assignment.
    findActiveForUpdate: async () =>
      setup?.assignedProgrammeId && setup.programmeStartedAt
        ? {
            id: "enrolment-1",
            programmeSlug: setup.assignedProgrammeId,
            programmeVersionId: null,
            assignmentId: setup.assignedProgrammeAssignmentId ?? null,
          }
        : null,
    completeActiveInTransaction: async () => undefined,
  };

  const service = new ProgressionService(
    harness.dataSource as never,
    emitter as never,
    dispatcher as never,
    enrolments as never,
  );

  return { service, emitter, dispatcher };
}

test("the first completion emits programme.completed then programme.count_reached", async () => {
  const { service, emitter, dispatcher } = buildService({ insertReturnsOrdinal: 1 });

  const result = await service.completeProgramme(user);

  assert.equal(result.recorded, true);
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.programmeCompleted, eventNameTokens.programmeCountReached],
  );
  assert.deepEqual(emitter.emitted[0]?.payload, {
    userId: "user-1",
    programmeId: PROGRAMME_ID,
  });
  assert.deepEqual(emitter.emitted[1]?.payload, { userId: "user-1", count: 1 });
  assert.equal(dispatcher.sawOpenTransaction, false);
});

test("a second completion of the same programme (lost gate) emits nothing", async () => {
  const { service, emitter } = buildService({ insertReturnsOrdinal: null });

  const result = await service.completeProgramme(user);

  assert.equal(result.recorded, false);
  assert.deepEqual(emitter.emitted, []);
});

test("count reflects the ordinal minted by the gate, not a fixed number", async () => {
  const { service, emitter } = buildService({ insertReturnsOrdinal: 3 });

  await service.completeProgramme(user);

  assert.deepEqual(emitter.emitted[1]?.payload, { userId: "user-1", count: 3 });
  assert.equal(
    emitter.emitted[1]?.eventId,
    `${eventNameTokens.programmeCountReached}:user-1:3`,
  );
});

test("completing with no programme under way throws NO_ACTIVE_PROGRAMME", async () => {
  const { service } = buildService({ setup: null });

  await assert.rejects(
    () => service.completeProgramme(user),
    /NO_ACTIVE_PROGRAMME|No programme is currently under way/,
  );
});

test("completing before the programme has started throws NO_ACTIVE_PROGRAMME", async () => {
  const { service } = buildService({
    setup: { assignedProgrammeId: PROGRAMME_ID, programmeStartedAt: null },
  });

  await assert.rejects(
    () => service.completeProgramme(user),
    /NO_ACTIVE_PROGRAMME|No programme is currently under way/,
  );
});
