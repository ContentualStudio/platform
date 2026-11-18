import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeDayServeJob } from "./programme-day-serve.job";
import type { DailyTaskNoticeOutcome } from "./daily-task-notice.service";

function build(options: {
  readonly serve?: "succeeded" | "skipped";
  readonly notice?: DailyTaskNoticeOutcome;
  readonly noticeThrows?: boolean;
} = {}) {
  const noticeCalls: { userId: string; localDate: string }[] = [];

  const enrolments = {
    serveLocalMorning: async () => options.serve ?? "succeeded",
  };

  const notices = {
    sendForServedMorning: async (
      userId: string,
      localDate: string,
    ): Promise<DailyTaskNoticeOutcome> => {
      noticeCalls.push({ userId, localDate });

      if (options.noticeThrows) {
        throw new Error("email down");
      }

      return options.notice ?? "sent";
    },
  };

  return {
    job: new ProgrammeDayServeJob(enrolments as never, notices as never),
    noticeCalls,
  };
}

test("a served morning composes its notice and succeeds", async () => {
  const { job, noticeCalls } = build({
    serve: "succeeded",
    notice: "sent",
  });

  assert.equal(await job.run("user-1", "2026-09-21"), "succeeded");
  assert.deepEqual(noticeCalls, [
    { userId: "user-1", localDate: "2026-09-21" },
  ]);
});

test("a skip with nothing to notify stays a skip", async () => {
  const { job, noticeCalls } = build({
    serve: "skipped",
    notice: "suppressed",
  });

  assert.equal(await job.run("user-1", "2026-09-21"), "skipped");
  assert.deepEqual(noticeCalls, [
    { userId: "user-1", localDate: "2026-09-21" },
  ]);
});

test("a final-day retry delivers from the serve row and succeeds", async () => {
  // The serve completed the enrolment on the first attempt, so every retry
  // skips — but today's serve row, and possibly an undelivered email, is
  // still there. The notice resolves from the row, not the enrolment.
  const { job, noticeCalls } = build({
    serve: "skipped",
    notice: "sent",
  });

  assert.equal(await job.run("user-1", "2026-09-21"), "succeeded");
  assert.deepEqual(noticeCalls, [
    { userId: "user-1", localDate: "2026-09-21" },
  ]);
});

test("a notice failure fails the run so the sweep reclaims it", async () => {
  const { job } = build({ serve: "succeeded", noticeThrows: true });

  await assert.rejects(job.run("user-1", "2026-09-21"), /email down/);
});
