import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import type { ProgrammeEnrolmentEntity } from "../programme-enrolment/entities/programme-enrolment.entity";
import { UpcomingTasksService } from "./upcoming-tasks.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

const PROGRAMME_SLUG = "30-day-growth";

function task(dayNumber: number, overrides: Partial<ProgrammeTask> = {}): ProgrammeTask {
  return {
    id: `task-${dayNumber}`,
    title: `Day ${dayNumber} task`,
    contentType: "video",
    weekIndex: Math.ceil(dayNumber / 7),
    dayIndex: ((dayNumber - 1) % 7) + 1,
    dayNumber,
    orderWithinDay: 1,
    ...overrides,
  };
}

function build(options: {
  enrolment?: Partial<ProgrammeEnrolmentEntity> | null;
  tasks?: ProgrammeTask[];
}) {
  const enrolment =
    options.enrolment === null
      ? null
      : ({
          id: "enrolment-1",
          userId: user.id,
          programmeSlug: PROGRAMME_SLUG,
          programmeVersionId: null,
          durationDays: 30,
          currentDay: 1,
          lastServedDay: null,
          status: "active",
          ...options.enrolment,
        } as ProgrammeEnrolmentEntity);

  const enrolments = {
    findActiveForUser: async () => enrolment,
  };
  const reader = {
    tasksForProgramme: async () => options.tasks ?? [],
    tasksForProgrammeVersion: async () => options.tasks ?? [],
  } as unknown as ProgrammeContentReader;

  return new UpcomingTasksService(enrolments as never, reader);
}

test("lists the six days after the day the user is on, in day order", async () => {
  const service = build({
    enrolment: { lastServedDay: 3, currentDay: 4 },
    tasks: Array.from({ length: 30 }, (_unused, index) => task(index + 1)).reverse(),
  });

  const view = await service.listUpcoming(user);

  assert.equal(view.hasActiveProgramme, true);
  assert.equal(view.currentDay, 3);
  assert.deepEqual(
    view.days.map((day) => day.dayNumber),
    [4, 5, 6, 7, 8, 9],
  );
  assert.equal(view.reachesProgrammeEnd, false);
});

test("opens at day 1 before the first morning sweep has served anything", async () => {
  const service = build({
    tasks: [task(1), task(2)],
  });

  const view = await service.listUpcoming(user);

  assert.equal(view.currentDay, 0);
  assert.deepEqual(
    view.days.map((day) => day.dayNumber),
    [1, 2],
  );
});

test("omits fields the mirror did not author and keeps the ones it did", async () => {
  const service = build({
    enrolment: { lastServedDay: 1 },
    tasks: [
      task(2, {
        dayType: "push",
        cameraRequired: true,
        timeEstimateMinutes: 25,
      }),
      task(3, { dayType: null, cameraRequired: false, timeEstimateMinutes: null }),
    ],
  });

  const [withFields, withoutFields] = (await service.listUpcoming(user)).days;

  assert.deepEqual(withFields, {
    dayNumber: 2,
    taskId: "task-2",
    title: "Day 2 task",
    contentType: "video",
    dayType: "push",
    cameraRequired: true,
    timeEstimateMinutes: 25,
  });
  assert.deepEqual(withoutFields, {
    dayNumber: 3,
    taskId: "task-3",
    title: "Day 3 task",
    contentType: "video",
  });
});

test("omits gap days and never reaches past the programme's final day", async () => {
  const service = build({
    enrolment: { lastServedDay: 26, durationDays: 30 },
    tasks: [task(27), task(29), task(30)],
  });

  const view = await service.listUpcoming(user);

  assert.deepEqual(
    view.days.map((day) => day.dayNumber),
    [27, 29, 30],
  );
  assert.equal(view.reachesProgrammeEnd, true);
});

test("returns an empty window once the final day has been served", async () => {
  const service = build({
    enrolment: { lastServedDay: 30, durationDays: 30 },
    tasks: [task(30)],
  });

  const view = await service.listUpcoming(user);

  assert.deepEqual(view.days, []);
  assert.equal(view.reachesProgrammeEnd, true);
});

test("reports no active programme rather than failing", async () => {
  const service = build({ enrolment: null });

  const view = await service.listUpcoming(user);

  assert.deepEqual(view, {
    hasActiveProgramme: false,
    programmeSlug: null,
    currentDay: 0,
    durationDays: 0,
    reachesProgrammeEnd: false,
    days: [],
  });
});

test("keeps only the first authored task when a day carries several", async () => {
  const service = build({
    enrolment: { lastServedDay: 1 },
    tasks: [
      task(2, { id: "task-2b", orderWithinDay: 2 }),
      task(2, { id: "task-2a", orderWithinDay: 1 }),
    ],
  });

  const view = await service.listUpcoming(user);

  assert.deepEqual(
    view.days.map((day) => day.taskId),
    ["task-2a"],
  );
});

test("previews an upcoming day's full authored task", async () => {
  const service = build({
    enrolment: { lastServedDay: 1 },
    tasks: [task(2, { objective: "Ship one reel" })],
  });

  const preview = await service.findUpcomingDay(user, 2);

  assert.equal(preview.id, "task-2");
  assert.equal(preview.objective, "Ship one reel");
});

test("refuses a preview of a past day, a day past the end, or a gap day", async () => {
  const service = build({
    enrolment: { lastServedDay: 5, durationDays: 10 },
    tasks: [task(6)],
  });

  await assert.rejects(() => service.findUpcomingDay(user, 5), /not part of your upcoming/);
  await assert.rejects(() => service.findUpcomingDay(user, 11), /not part of your upcoming/);
  await assert.rejects(() => service.findUpcomingDay(user, 7), /no scheduled task/);
});

test("refuses a preview when nothing is active", async () => {
  const service = build({ enrolment: null });

  await assert.rejects(
    () => service.findUpcomingDay(user, 2),
    /No programme is currently active/,
  );
});

test("reads version content when the enrolment is pinned to a version", async () => {
  let versionRead = false;
  const enrolments = {
    findActiveForUser: async () =>
      ({
        id: "enrolment-1",
        userId: user.id,
        programmeSlug: PROGRAMME_SLUG,
        programmeVersionId: "version-1",
        durationDays: 30,
        currentDay: 3,
        lastServedDay: 2,
        status: "active",
      }) as ProgrammeEnrolmentEntity,
  };
  const reader = {
    tasksForProgramme: async () => {
      throw new Error("slug read must not be used for a versioned enrolment");
    },
    tasksForProgrammeVersion: async () => {
      versionRead = true;
      return [task(3)];
    },
  } as unknown as ProgrammeContentReader;

  const view = await new UpcomingTasksService(enrolments as never, reader).listUpcoming(user);

  assert.equal(versionRead, true);
  assert.deepEqual(
    view.days.map((day) => day.dayNumber),
    [3],
  );
});
