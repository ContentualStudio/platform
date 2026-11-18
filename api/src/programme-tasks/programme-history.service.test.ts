import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import { completionPercent, countCompletedDays } from "./enrolment-completion";
import { ProgrammeHistoryService } from "./programme-history.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

function task(id: string, dayNumber?: number): ProgrammeTask {
  return { id, dayNumber } as ProgrammeTask;
}

function enrolment(overrides: Record<string, unknown>) {
  return {
    id: "enrol-1",
    assignmentId: null,
    programmeSlug: "growth",
    programmeVersionId: null,
    status: "active",
    startedAt: new Date("2026-09-01T08:00:00Z"),
    completedAt: null,
    abandonedAt: null,
    durationDays: 10,
    ...overrides,
  };
}

function build(options: {
  enrolments: ReturnType<typeof enrolment>[];
  progress?: { ledgerKey: string; taskId: string; localDate: string }[];
  programmes?: Record<string, Partial<Programme>>;
  tasks?: Record<string, ProgrammeTask[]>;
}) {
  const queries: { sql: string; parameters: unknown[] }[] = [];
  const dataSource = {
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      return options.progress ?? [];
    },
  };
  const enrolmentReads: string[] = [];
  const enrolments = {
    listForUser: async (userId: string) => {
      enrolmentReads.push(userId);
      return options.enrolments;
    },
  };

  const contentReader = {
    findProgramme: async (slug: string) => options.programmes?.[slug],
    tasksForProgramme: async (slug: string) => options.tasks?.[slug] ?? [],
    tasksForProgrammeVersion: async (versionId: string) =>
      options.tasks?.[versionId] ?? [],
  } as unknown as ProgrammeContentReader;

  return {
    service: new ProgrammeHistoryService(
      dataSource as never,
      enrolments as never,
      contentReader,
    ),
    queries,
    enrolmentReads,
  };
}

test("completion % is completed days over duration, as a whole number", () => {
  assert.equal(completionPercent(0, 21), 0);
  assert.equal(completionPercent(7, 21), 33);
  assert.equal(completionPercent(14, 21), 67);
  assert.equal(completionPercent(21, 21), 100);
});

test("completion % never exceeds 100 and tolerates a zero duration", () => {
  assert.equal(completionPercent(25, 21), 100);
  assert.equal(completionPercent(3, 0), 0);
});

test("a day counts only when every one of its tasks is completed", () => {
  const days = new Map([
    ["a", 1],
    ["b", 1],
    ["c", 2],
    ["d", 2],
  ]);

  assert.equal(
    countCompletedDays(
      [
        { ledgerKey: "k", taskId: "a", localDate: "2026-09-01" },
        { ledgerKey: "k", taskId: "b", localDate: "2026-09-01" },
        // Day 2 is only half done.
        { ledgerKey: "k", taskId: "c", localDate: "2026-09-02" },
      ],
      days,
    ),
    1,
  );
});

test("the same task completed on two dates is still one task", () => {
  const days = new Map([
    ["a", 1],
    ["b", 1],
  ]);

  assert.equal(
    countCompletedDays(
      [
        { ledgerKey: "k", taskId: "a", localDate: "2026-09-01" },
        { ledgerKey: "k", taskId: "a", localDate: "2026-09-02" },
      ],
      days,
    ),
    0,
  );
});

test("a completed task the journey's content no longer carries does not count", () => {
  assert.equal(
    countCompletedDays(
      [{ ledgerKey: "k", taskId: "gone", localDate: "2026-09-01" }],
      new Map([["a", 1]]),
    ),
    0,
  );
});

test("history splits in-progress from past and names each programme from the mirror", async () => {
  const { service, queries, enrolmentReads } = build({
    enrolments: [
      enrolment({ id: "now", programmeSlug: "growth", status: "active" }),
      enrolment({
        id: "done",
        programmeSlug: "first-take",
        status: "completed",
        completedAt: new Date("2026-08-21T08:00:00Z"),
        durationDays: 4,
      }),
      enrolment({
        id: "quit",
        programmeSlug: "first-take",
        status: "abandoned",
        abandonedAt: new Date("2026-07-10T08:00:00Z"),
        durationDays: 4,
      }),
    ],
    programmes: {
      growth: { title: "Growth", track: "grow" },
      "first-take": { title: "First Take", track: "starter" },
    },
    tasks: {
      growth: [task("g1", 1), task("g2", 2)],
      "first-take": [task("f1", 1), task("f2", 2), task("f3", 3), task("f4", 4)],
    },
    progress: [
      { ledgerKey: "now", taskId: "g1", localDate: "2026-09-01" },
      { ledgerKey: "done", taskId: "f1", localDate: "2026-08-18" },
      { ledgerKey: "done", taskId: "f2", localDate: "2026-08-19" },
      { ledgerKey: "done", taskId: "f3", localDate: "2026-08-20" },
      { ledgerKey: "quit", taskId: "f1", localDate: "2026-07-09" },
    ],
  });

  const history = await service.forUser(user);

  assert.deepEqual(
    history.inProgress.map((entry) => [entry.enrolmentId, entry.completionPercent]),
    [["now", 10]],
  );
  assert.deepEqual(
    history.past.map((entry) => [entry.enrolmentId, entry.status, entry.completionPercent]),
    [
      ["done", "completed", 75],
      ["quit", "abandoned", 25],
    ],
  );
  assert.equal(history.inProgress[0]?.title, "Growth");
  assert.equal(history.inProgress[0]?.track, "grow");
  assert.equal(history.inProgress[0]?.endedAt, null);
  assert.equal(history.past[0]?.endedAt, "2026-08-21T08:00:00.000Z");
  assert.equal(history.past[1]?.endedAt, "2026-07-10T08:00:00.000Z");

  // Both reads are scoped to the caller.
  assert.deepEqual(enrolmentReads, ["user-1"]);
  for (const query of queries) {
    assert.deepEqual(query.parameters, ["user-1"]);
  }
});

test("running the same programme twice keeps each run's progress separate", async () => {
  const { service } = build({
    enrolments: [
      enrolment({ id: "second", status: "active", durationDays: 2 }),
      enrolment({
        id: "first",
        status: "completed",
        completedAt: new Date("2026-08-01T08:00:00Z"),
        durationDays: 2,
      }),
    ],
    programmes: { growth: { title: "Growth" } },
    tasks: { growth: [task("g1", 1), task("g2", 2)] },
    progress: [
      { ledgerKey: "first", taskId: "g1", localDate: "2026-07-30" },
      { ledgerKey: "first", taskId: "g2", localDate: "2026-07-31" },
    ],
  });

  const history = await service.forUser(user);

  assert.equal(history.inProgress[0]?.completionPercent, 0);
  assert.equal(history.past[0]?.completionPercent, 100);
});

test("progress filed under the assignment id belongs to the matched journey", async () => {
  const { service } = build({
    enrolments: [enrolment({ id: "enrol-1", assignmentId: "assign-1", durationDays: 2 })],
    programmes: { growth: { title: "Growth" } },
    tasks: { growth: [task("g1", 1), task("g2", 2)] },
    progress: [{ ledgerKey: "assign-1", taskId: "g1", localDate: "2026-09-01" }],
  });

  assert.equal((await service.forUser(user)).inProgress[0]?.completionPercent, 50);
});

test("a versioned journey reads the day numbers of the version it ran", async () => {
  const { service } = build({
    enrolments: [enrolment({ programmeVersionId: "v1", durationDays: 2 })],
    programmes: { growth: { title: "Growth" } },
    tasks: {
      v1: [task("g1", 1), task("g2", 2)],
      // The current content moved both tasks onto day 1.
      growth: [task("g1", 1), task("g2", 1)],
    },
    progress: [
      { ledgerKey: "enrol-1", taskId: "g1", localDate: "2026-09-01" },
      { ledgerKey: "enrol-1", taskId: "g2", localDate: "2026-09-02" },
    ],
  });

  assert.equal((await service.forUser(user)).inProgress[0]?.completedDays, 2);
});

test("a programme missing from the mirror still shows, with no title", async () => {
  const { service } = build({
    enrolments: [enrolment({ programmeSlug: "retired", status: "completed" })],
  });

  const [entry] = (await service.forUser(user)).past;

  assert.equal(entry?.slug, "retired");
  assert.equal(entry?.title, null);
  assert.equal(entry?.track, null);
});

test("no enrolments is an empty history, not an error", async () => {
  const { service } = build({ enrolments: [] });

  assert.deepEqual(await service.forUser(user), { inProgress: [], past: [] });
});

test("a journey that has not ended stays in progress whatever its status", async () => {
  const { service } = build({
    enrolments: [enrolment({ id: "paused", status: "paused" })],
  });

  const history = await service.forUser(user);

  assert.deepEqual(history.inProgress.map((entry) => entry.enrolmentId), ["paused"]);
  assert.deepEqual(history.past, []);
});
