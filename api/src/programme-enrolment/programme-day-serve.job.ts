import { Injectable } from "@nestjs/common";
import type { SweepJob } from "../scheduling/sweep-job.port";
import { DailyTaskNoticeService } from "./daily-task-notice.service";
import { ProgrammeEnrolmentService } from "./programme-enrolment.service";

/**
 * Serves each enrolled user the task for their current programme day at
 * roughly 7am local time. Registered on the shared daily-local sweep so it
 * shares claim/lease/idempotency with every other morning job.
 *
 * Serve-then-notify is one unit: once the enrolment state advances, the
 * day's in-app + email notice is composed from the served task. Retries are
 * safe: the serve reuses today's row instead of advancing a day, and each
 * notice channel carries its own delivery record — so a notice failure fails
 * the run (and is retried within the morning) without ever serving
 * tomorrow's task today or delivering a channel twice.
 *
 * The notice runs even when the serve skips: after the final task the
 * enrolment is completed, so every retry skips — but today's serve row, and
 * possibly an undelivered email, is still there. The notice resolves from
 * that row rather than the active enrolment, which is what keeps a final-day
 * retry from dropping the email.
 */
const SCOPE_SQL = `
  EXISTS (
    SELECT 1 FROM "programme_enrolment" e
     WHERE e."userId" = p."userId"
       AND e."status" = 'active'
  )
`;

@Injectable()
export class ProgrammeDayServeJob implements SweepJob {
  readonly name = "programme.day-serve";
  readonly scopeSql = SCOPE_SQL;

  constructor(
    private readonly enrolments: ProgrammeEnrolmentService,
    private readonly notices: DailyTaskNoticeService,
  ) {}

  async run(userId: string, localDate: string): Promise<"succeeded" | "skipped"> {
    const outcome = await this.enrolments.serveLocalMorning(userId, localDate);
    const notice = await this.notices.sendForServedMorning(userId, localDate);

    // A skip with nothing to notify (no enrolment, future day, rest day) stays
    // a skip rather than a failure to retry. A skip that still delivered —
    // the final-day retry shape — counts as succeeded: the morning's work is
    // done and there is nothing left to re-offer.
    return outcome === "succeeded" || notice === "sent"
      ? "succeeded"
      : "skipped";
  }
}
