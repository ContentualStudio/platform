import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import {
  DailyTaskNoticeService,
  DailyTaskNoticeEmailError,
} from "./daily-task-notice.service";

const USER_ID = "user-1";
const LOCAL_DATE = "2026-09-21";

function task(overrides: Partial<ProgrammeTask> = {}): ProgrammeTask {
  return {
    id: "thirty-day-foundations-day-4",
    title: "Film your first three pieces",
    contentType: "video",
    weekIndex: 1,
    dayIndex: 4,
    dayNumber: 4,
    orderWithinDay: 1,
    objective: "Bank footage you can work with.",
    ...overrides,
  };
}

interface ServeRow {
  enrolmentId: string;
  programmeSlug: string;
  programmeDay: number;
  taskId: string | null;
  outcome: "served" | "gap_skipped";
  localDate: string;
}

function buildHarness(options: {
  serveRows?: ServeRow[];
  programmeVersionId?: string | null;
  tasks?: ProgrammeTask[];
  versionTasks?: ProgrammeTask[];
  userEmail?: string | null;
  inAppOptedOut?: boolean;
  emailOptedOut?: boolean;
  inboxReplay?: boolean;
  existingDedupeKeys?: string[];
  deliveredEmails?: { localDate: string; programmeDay: number }[];
  emailFails?: boolean;
} = {}) {
  const {
    serveRows = [
      {
        enrolmentId: "enrolment-1",
        programmeSlug: "thirty-day-foundations",
        programmeDay: 4,
        taskId: "thirty-day-foundations-day-4",
        outcome: "served",
        localDate: LOCAL_DATE,
      },
    ],
    programmeVersionId = null,
    tasks = [task()],
    versionTasks = [task()],
    userEmail = "creator@example.com",
    inAppOptedOut = false,
    emailOptedOut = false,
    inboxReplay = false,
    existingDedupeKeys = inboxReplay
      ? [`daily-task-notice:${LOCAL_DATE}:day-4`]
      : [],
    deliveredEmails = [],
    emailFails = false,
  } = options;

  const inboxInputs: Record<string, unknown>[] = [];
  const writtenDedupeKeys = new Set<string>(existingDedupeKeys);
  const emailInputs: Record<string, unknown>[] = [];
  const dayReads: string[] = [];
  const versionDayReads: string[] = [];
  const delivered: { localDate: string; programmeDay: number }[] = [
    ...deliveredEmails,
  ];
  let emailFailsFlag = emailFails;

  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM "daily_task_notice_delivery"')) {
        return delivered
          .filter(
            (row) =>
              params[0] === USER_ID &&
              row.localDate === params[1] &&
              row.programmeDay === Number(params[2]),
          )
          .map(() => ({ id: "delivery-1" }));
      }

      if (sql.includes('INSERT INTO "daily_task_notice_delivery"')) {
        const key = {
          localDate: String(params[1]),
          programmeDay: Number(params[2]),
        };

        if (
          !delivered.some(
            (row) =>
              row.localDate === key.localDate &&
              row.programmeDay === key.programmeDay,
          )
        ) {
          delivered.push(key);
        }

        return [{ id: `delivery-${delivered.length}` }];
      }

      if (sql.includes('FROM "programme_day_serve"')) {
        // Mirrors the query's ORDER BY "programmeDay" DESC LIMIT 1.
        const [latest] = serveRows
          .filter(
            (row) =>
              params[0] === USER_ID &&
              row.localDate === params[1] &&
              row.outcome === "served" &&
              row.taskId !== null,
          )
          .sort((left, right) => right.programmeDay - left.programmeDay)
          .slice(0, 1);

        return latest ? [latest] : [];
      }

      if (sql.includes('FROM "programme_enrolment"')) {
        return [{ programmeVersionId }];
      }

      if (sql.includes('FROM "user"')) {
        return userEmail ? [{ email: userEmail }] : [];
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    transaction: async <T>(work: (manager: unknown) => Promise<T>) =>
      work({}),
  };

  const notifications = {
    isDeliveryAllowed: async (
      _user: unknown,
      _type: string,
      channel: string,
    ) =>
      channel === "in_app" ? !inAppOptedOut : !emailOptedOut,
    createInAppNotification: async (
      _manager: unknown,
      input: Record<string, unknown>,
    ) => {
      inboxInputs.push(input);

      if (inAppOptedOut) {
        return null;
      }

      // Emulates ON CONFLICT ("userId", "dedupeKey") DO NOTHING.
      if (writtenDedupeKeys.has(input.dedupeKey as string)) {
        return null;
      }

      writtenDedupeKeys.add(input.dedupeKey as string);

      return {
        id: "notification-1",
        type: input.notificationType,
        title: input.title,
        description: input.message,
        actionUrl: input.actionUrl,
        read: false,
        createdAt: new Date().toISOString(),
      };
    },
  };

  const email = {
    sendDailyTaskNotice: async (input: Record<string, unknown>) => {
      emailInputs.push(input);

      if (emailFailsFlag) {
        return { ok: false as const, error: "Resend request failed" };
      }

      return { ok: true as const, id: "email-1" };
    },
  };

  const configService = {
    get: (key: string) =>
      key === "auth.webOrigin" ? "https://app.example.test" : undefined,
  };

  const contentReader = {
    tasksForProgrammeDay: async (slug: string, day: number) => {
      dayReads.push(`${slug}:${day}`);
      return tasks;
    },
    tasksForProgrammeDayVersion: async (versionId: string, day: number) => {
      versionDayReads.push(`${versionId}:${day}`);
      return versionTasks;
    },
  };

  const service = new DailyTaskNoticeService(
    dataSource as never,
    notifications as never,
    email as never,
    configService as never,
    contentReader as never,
  );

  return {
    service,
    inboxInputs,
    emailInputs,
    dayReads,
    versionDayReads,
    delivered,
    setEmailFails(value: boolean) {
      emailFailsFlag = value;
    },
  };
}

test("an active task day sends in-app and email scoped to the served user", async () => {
  const harness = buildHarness();

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "sent");
  assert.equal(harness.inboxInputs.length, 1);
  assert.deepEqual(harness.inboxInputs[0], {
    userId: USER_ID,
    notificationType: "daily_task_notice",
    title: "Daily task notice",
    message: "Film your first three pieces",
    actionUrl: "/dashboard",
    dedupeKey: `daily-task-notice:${LOCAL_DATE}:day-4`,
  });
  assert.equal(harness.emailInputs.length, 1);
  assert.deepEqual(harness.emailInputs[0], {
    to: "creator@example.com",
    taskTitle: "Film your first three pieces",
    taskSummary: "Bank footage you can work with.",
    actionUrl: "https://app.example.test/dashboard",
    idempotencyKey: `daily-task-notice/${USER_ID}/${LOCAL_DATE}/day-4`,
  });
  assert.deepEqual(harness.delivered, [
    { localDate: LOCAL_DATE, programmeDay: 4 },
  ]);
});

test("a rest day with no served row sends nothing", async () => {
  const harness = buildHarness({ serveRows: [] });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "suppressed");
  assert.equal(harness.inboxInputs.length, 0);
  assert.equal(harness.emailInputs.length, 0);
});

test("a gap-skipped day sends nothing and never links a task", async () => {
  const harness = buildHarness({
    serveRows: [
      {
        enrolmentId: "enrolment-1",
        programmeSlug: "thirty-day-foundations",
        programmeDay: 4,
        taskId: null,
        outcome: "gap_skipped",
        localDate: LOCAL_DATE,
      },
    ],
  });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "suppressed");
  assert.equal(harness.inboxInputs.length, 0);
  assert.equal(harness.emailInputs.length, 0);
});

test("an email opt-out still sends in-app but no email", async () => {
  const harness = buildHarness({ emailOptedOut: true });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "sent");
  assert.equal(harness.inboxInputs.length, 1);
  assert.equal(harness.emailInputs.length, 0);
});

test("an in-app opt-out skips the inbox but still sends email", async () => {
  const harness = buildHarness({ inAppOptedOut: true });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "sent");
  assert.equal(harness.inboxInputs.length, 0);
  assert.equal(harness.emailInputs.length, 1);
});

test("a double-fire delivers each channel exactly once", async () => {
  const harness = buildHarness();

  assert.equal(
    await harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    "sent",
  );
  assert.equal(
    await harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    "suppressed",
  );

  assert.equal(harness.inboxInputs.length, 2);
  assert.equal(harness.emailInputs.length, 1);
  assert.deepEqual(harness.delivered, [
    { localDate: LOCAL_DATE, programmeDay: 4 },
  ]);
});

test("a retry after both channels completed sends nothing", async () => {
  // Cross-process shape: an earlier attempt delivered fully, then crashed
  // before the sweep recorded the finish. The serve layer reuses day 4's
  // row (never serving day 5), and both delivery records dedupe here.
  const harness = buildHarness({
    existingDedupeKeys: [`daily-task-notice:${LOCAL_DATE}:day-4`],
    deliveredEmails: [{ localDate: LOCAL_DATE, programmeDay: 4 }],
  });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "suppressed");
  assert.equal(harness.inboxInputs.length, 1);
  assert.equal(harness.emailInputs.length, 0);
});

test("a retry with inbox done but email pending sends only the email", async () => {
  // Crash between the inbox write and the email send: in-app replays, but
  // the empty email ledger means the email must still go out once.
  const harness = buildHarness({
    existingDedupeKeys: [`daily-task-notice:${LOCAL_DATE}:day-4`],
  });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "sent");
  assert.equal(harness.inboxInputs.length, 1);
  assert.equal(harness.emailInputs.length, 1);
  assert.deepEqual(harness.delivered, [
    { localDate: LOCAL_DATE, programmeDay: 4 },
  ]);
});

test("replays while in-app is opted out still send the email once", async () => {
  // Email durability must not depend on the inbox: under an in-app opt-out
  // the inbox always reports nothing written, so only the ledger can tell a
  // first attempt from a retry.
  const harness = buildHarness({ inAppOptedOut: true });

  assert.equal(
    await harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    "sent",
  );
  assert.equal(
    await harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    "suppressed",
  );

  assert.equal(harness.inboxInputs.length, 0);
  assert.equal(harness.emailInputs.length, 1);
});

test("a served row with no readable task is suppressed", async () => {
  const harness = buildHarness({ tasks: [] });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "suppressed");
  assert.equal(harness.inboxInputs.length, 0);
  assert.equal(harness.emailInputs.length, 0);
});

test("a version-pinned enrolment resolves the task from its snapshot", async () => {
  const harness = buildHarness({
    programmeVersionId: "version-1",
    versionTasks: [task({ title: "Pinned snapshot task" })],
  });

  const outcome = await harness.service.sendForServedMorning(
    USER_ID,
    LOCAL_DATE,
  );

  assert.equal(outcome, "sent");
  assert.deepEqual(harness.versionDayReads, ["version-1:4"]);
  assert.equal(harness.dayReads.length, 0);
  assert.equal(
    (harness.inboxInputs[0] as { message: string }).message,
    "Pinned snapshot task",
  );
});

test("an email failure throws so the sweep retries it", async () => {
  const harness = buildHarness({ emailFails: true });

  await assert.rejects(
    harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    DailyTaskNoticeEmailError,
  );
  assert.equal(harness.inboxInputs.length, 1);
  assert.equal(harness.emailInputs.length, 1);
  assert.deepEqual(harness.delivered, []);

  // The retry finds the inbox replay but an empty email ledger, resends,
  // records, and reports the delivery.
  harness.setEmailFails(false);

  assert.equal(
    await harness.service.sendForServedMorning(USER_ID, LOCAL_DATE),
    "sent",
  );
  assert.equal(harness.inboxInputs.length, 2);
  assert.equal(harness.emailInputs.length, 2);
  assert.deepEqual(harness.delivered, [
    { localDate: LOCAL_DATE, programmeDay: 4 },
  ]);
});
