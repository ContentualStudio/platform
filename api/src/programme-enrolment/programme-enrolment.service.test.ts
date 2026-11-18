import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource, EntityManager } from "typeorm";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import { ProgrammeEnrolmentService } from "./programme-enrolment.service";

interface EnrolmentRow {
  id: string;
  userId: string;
  programmeSlug: string;
  programmeVersionId: string | null;
  assignmentId: string | null;
  status: string;
  startedAt: Date;
  currentDay: number;
  lastServedDay: number | null;
  durationDays: number;
  day1ScheduledFor: string;
  completedAt: Date | null;
  abandonedAt: Date | null;
}

function buildHarness(options: {
  enrolment?: EnrolmentRow | null;
  tasksByDay?: Record<number, ProgrammeTask[]>;
}) {
  let enrolment = options.enrolment
    ? { ...options.enrolment }
    : null;
  const serves: Array<Record<string, unknown>> = [];
  const gaps: Array<Record<string, unknown>> = [];
  const statements: string[] = [];

  const manager = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push(sql);

      if (sql.includes("FOR UPDATE") && sql.includes("programme_enrolment")) {
        return enrolment?.status === "active" ? [enrolment] : [];
      }

      if (sql.includes('INSERT INTO "programme_enrolment"')) {
        enrolment = {
          id: "enrolment-1",
          userId: String(params[0]),
          programmeSlug: String(params[1]),
          programmeVersionId: (params[2] as string | null) ?? null,
          assignmentId: (params[3] as string | null) ?? null,
          status: "active",
          startedAt: params[4] as Date,
          currentDay: 1,
          lastServedDay: null,
          durationDays: Number(params[5]),
          day1ScheduledFor: String(params[6]),
          completedAt: null,
          abandonedAt: null,
        };
        return [{ id: "enrolment-1" }];
      }

      if (
        sql.includes('UPDATE "programme_enrolment"') &&
        sql.includes("'abandoned'")
      ) {
        if (enrolment?.status === "active") {
          enrolment = {
            ...enrolment,
            status: "abandoned",
            abandonedAt: params[1] as Date,
          };
        }
        return [[], 1];
      }

      if (
        sql.includes('UPDATE "programme_enrolment"') &&
        sql.includes("'completed'")
      ) {
        if (enrolment && (enrolment.id === params[0] || enrolment.userId === params[0])) {
          enrolment = {
            ...enrolment,
            status: "completed",
            completedAt: params[1] as Date,
          };
        }
        return [[], 1];
      }

      if (sql.includes('INSERT INTO "programme_day_serve"')) {
        const programmeDay = Number(params[3]);
        if (serves.some((row) => row.programmeDay === programmeDay)) {
          return [];
        }
        const row = {
          enrolmentId: params[0],
          userId: params[1],
          programmeSlug: params[2],
          programmeDay,
          localDate: params[4],
          taskId: params[5],
          outcome: params[6],
        };
        serves.push(row);
        return [{ id: String(serves.length) }];
      }

      if (
        sql.includes('UPDATE "programme_enrolment"') &&
        sql.includes('"currentDay"')
      ) {
        if (enrolment && enrolment.id === params[0] && enrolment.currentDay === params[3]) {
          enrolment = {
            ...enrolment,
            currentDay: Number(params[1]),
            lastServedDay: Number(params[2]),
          };
        }
        return [[], 1];
      }

      if (
        sql.includes('FROM "programme_day_serve"') &&
        sql.includes('"localDate"')
      ) {
        return serves
          .filter(
            (row) =>
              row.enrolmentId === params[0] &&
              row.localDate === params[1] &&
              row.outcome === "served",
          )
          .sort(
            (left, right) =>
              Number(right.programmeDay) - Number(left.programmeDay),
          )
          .slice(0, 1)
          .map((row) => ({
            programmeDay: row.programmeDay,
            taskId: row.taskId,
            outcome: row.outcome,
          }));
      }

      if (sql.includes('INSERT INTO "programme_task_mirror_gap"')) {
        gaps.push({
          programmeSlug: params[0],
          programmeDay: params[1],
          enrolmentId: params[2],
          userId: params[3],
          localDate: params[4],
        });
        return [[], 1];
      }

      return [];
    },
  } as unknown as EntityManager;

  const dataSource = {
    transaction: async <T>(
      run: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => run(manager),
    query: manager.query.bind(manager),
  } as unknown as DataSource;

  const contentReader = {
    tasksForProgrammeDay: async (_slug: string, day: number) =>
      options.tasksByDay?.[day] ?? [],
    tasksForProgrammeDayVersion: async (_version: string, day: number) =>
      options.tasksByDay?.[day] ?? [],
  };

  const service = new ProgrammeEnrolmentService(
    dataSource,
    contentReader as never,
  );

  return {
    service,
    get enrolment() {
      return enrolment;
    },
    serves,
    gaps,
    statements,
  };
}

const baseEnrolment = (): EnrolmentRow => ({
  id: "enrolment-1",
  userId: "user-1",
  programmeSlug: "first-take",
  programmeVersionId: null,
  assignmentId: "assignment-1",
  status: "active",
  startedAt: new Date("2026-09-01T12:00:00.000Z"),
  currentDay: 1,
  lastServedDay: null,
  durationDays: 3,
  day1ScheduledFor: "2026-09-02",
  completedAt: null,
  abandonedAt: null,
});

test("start creates an active enrolment at day 1", async () => {
  const state: { enrolment: EnrolmentRow | null } = { enrolment: null };
  const localManager = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FOR UPDATE")) {
        return [];
      }
      if (sql.includes('INSERT INTO "programme_enrolment"')) {
        state.enrolment = {
          id: "enrolment-1",
          userId: String(params[0]),
          programmeSlug: String(params[1]),
          programmeVersionId: null,
          assignmentId: (params[3] as string | null) ?? null,
          status: "active",
          startedAt: params[4] as Date,
          currentDay: 1,
          lastServedDay: null,
          durationDays: Number(params[5]),
          day1ScheduledFor: String(params[6]),
          completedAt: null,
          abandonedAt: null,
        };
        return [{ id: "enrolment-1" }];
      }
      return [];
    },
  } as unknown as EntityManager;

  const service = new ProgrammeEnrolmentService(
    { transaction: async () => undefined } as never,
    {
      tasksForProgrammeDay: async () => [],
      tasksForProgrammeDayVersion: async () => [],
    } as never,
  );

  const result = await service.startInTransaction(localManager, {
    userId: "user-1",
    programmeSlug: "first-take",
    programmeVersionId: null,
    assignmentId: "assignment-1",
    startedAt: new Date("2026-09-01T12:00:00.000Z"),
    day1ScheduledFor: "2026-09-02",
    durationDays: 15,
  });

  assert.equal(result.created, true);
  assert.equal(state.enrolment?.currentDay, 1);
  assert.equal(state.enrolment?.status, "active");
  assert.equal(state.enrolment?.durationDays, 15);
});

test("serve before day 1 is skipped", async () => {
  const harness = buildHarness({
    enrolment: baseEnrolment(),
    tasksByDay: {
      1: [{ id: "t1", title: "Day 1", contentType: "video", weekIndex: 1, dayIndex: 1, dayNumber: 1 }],
    },
  });

  const outcome = await harness.service.serveLocalMorning("user-1", "2026-09-01");

  assert.equal(outcome, "skipped");
  assert.equal(harness.serves.length, 0);
  assert.equal(harness.enrolment?.currentDay, 1);
});

test("serve advances the day pointer and is idempotent", async () => {
  const harness = buildHarness({
    enrolment: baseEnrolment(),
    tasksByDay: {
      1: [{ id: "t1", title: "Day 1", contentType: "video", weekIndex: 1, dayIndex: 1, dayNumber: 1 }],
      2: [{ id: "t2", title: "Day 2", contentType: "photo", weekIndex: 1, dayIndex: 2, dayNumber: 2 }],
    },
  });

  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "succeeded");
  assert.equal(harness.enrolment?.currentDay, 2);
  assert.equal(harness.enrolment?.lastServedDay, 1);
  assert.equal(harness.serves.length, 1);

  // Crash-recovery shape: ledger already has day 1, pointer not yet advanced.
  harness.enrolment!.currentDay = 1;
  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "succeeded");
  assert.equal(harness.serves.length, 1);
  assert.equal(harness.enrolment?.currentDay, 2);
  assert.equal(harness.enrolment?.lastServedDay, 1);
});

test("a retry for the same local date reuses the served row", async () => {
  const harness = buildHarness({
    enrolment: baseEnrolment(),
    tasksByDay: {
      1: [{ id: "t1", title: "Day 1", contentType: "video", weekIndex: 1, dayIndex: 1, dayNumber: 1 }],
      2: [{ id: "t2", title: "Day 2", contentType: "photo", weekIndex: 1, dayIndex: 2, dayNumber: 2 }],
    },
  });

  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "succeeded");
  assert.equal(harness.serves.length, 1);
  assert.equal(harness.enrolment?.lastServedDay, 1);
  assert.equal(harness.enrolment?.currentDay, 2);

  // A failed notice delivery retries the same morning: the pointer must not
  // advance to day 2 under the same local date.
  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "succeeded");
  assert.equal(harness.serves.length, 1);
  assert.equal(harness.enrolment?.lastServedDay, 1);
  assert.equal(harness.enrolment?.currentDay, 2);
});

test("a missing task day records a gap and skips forward to the next task", async () => {
  const harness = buildHarness({
    enrolment: baseEnrolment(),
    tasksByDay: {
      2: [{ id: "t2", title: "Day 2", contentType: "photo", weekIndex: 1, dayIndex: 2, dayNumber: 2 }],
    },
  });

  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "succeeded");
  assert.equal(harness.gaps.length, 1);
  assert.equal(harness.gaps[0]?.programmeDay, 1);
  assert.deepEqual(
    harness.serves.map((row) => row.outcome),
    ["gap_skipped", "served"],
  );
  assert.equal(harness.enrolment?.currentDay, 3);
  assert.equal(harness.enrolment?.lastServedDay, 2);
});

test("serving the final day completes the enrolment", async () => {
  const harness = buildHarness({
    enrolment: {
      ...baseEnrolment(),
      currentDay: 3,
      lastServedDay: 2,
      durationDays: 3,
    },
    tasksByDay: {
      3: [{ id: "t3", title: "Day 3", contentType: "caption", weekIndex: 1, dayIndex: 3, dayNumber: 3 }],
    },
  });

  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-04"), "succeeded");
  assert.equal(harness.enrolment?.status, "completed");
  assert.equal(harness.enrolment?.currentDay, 4);
  assert.equal(harness.enrolment?.lastServedDay, 3);
});

test("users without an active enrolment are skipped", async () => {
  const harness = buildHarness({ enrolment: null });

  assert.equal(await harness.service.serveLocalMorning("user-1", "2026-09-02"), "skipped");
});
