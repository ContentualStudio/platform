import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import { EmailService } from "../email/email.service";
import {
  notificationRegistry,
  type NotificationType,
} from "../notifications/notification-registry";
import { NotificationsService } from "../notifications/notifications.service";

const DAILY_TASK_NOTICE_TYPE = "daily_task_notice" satisfies NotificationType;

// Where both the in-app action link and the email button land: the dashboard
// renders today's tasks (DailyCockpitDashboard), so the user continues in the
// normal dashboard/task flow. Must stay a safe internal path — the inbox
// rejects anything else.
const TASK_CARD_PATH = "/dashboard";

// Rest/no-task days carry no notice. The ticket allows reflecting or
// suppressing per configuration; suppression is the default until the
// event-to-channel matrix lands, and it guarantees we never link to a task
// that does not exist.
const SEND_REST_DAY_NOTICE = false;

export type DailyTaskNoticeOutcome = "sent" | "suppressed";

export class DailyTaskNoticeEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyTaskNoticeEmailError";
  }
}

interface ServedDayRow {
  enrolmentId: string;
  programmeSlug: string;
  programmeDay: number;
  taskId: string;
}

/**
 * Composes and delivers the 7am daily task notice for one served user-day.
 *
 * The timezone-sweep cron serves each user once per local day through
 * `ProgrammeDayServeJob`; this unit runs immediately afterwards in the same
 * job and builds what that served day sends — an in-app message through the
 * shared realtime component and an email through the transactional stream,
 * each gated by the user's per-type opt-out.
 *
 * Durability is per channel, so neither depends on the other. In-app rides
 * the inbox table's own per-user dedupe key; email rides a delivery-ledger
 * row that is written only after the provider confirms the send. A re-run or
 * double-fire for the same served day writes no second row on either
 * channel — including when the user opted out of in-app, where the inbox
 * deliberately records nothing. An email failure throws: the serve layer
 * reuses today's row on retry (never advancing a day), the inbox dedupes,
 * and the empty email ledger means the retry resends.
 */
@Injectable()
export class DailyTaskNoticeService {
  private readonly logger = new Logger(DailyTaskNoticeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly configService: ConfigService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  async sendForServedMorning(
    userId: string,
    localDate: string,
  ): Promise<DailyTaskNoticeOutcome> {
    const served = await this.findServedDay(userId, localDate);

    if (!served) {
      // Rest day, gap day, or nothing newly served — never name or link a
      // task that does not exist.
      if (SEND_REST_DAY_NOTICE) {
        this.logger.warn(
          `Rest-day notice is enabled but not implemented for ${userId} on ${localDate}.`,
        );
      }
      return "suppressed";
    }

    const task = await this.resolveTask(served);

    if (!task) {
      this.logger.warn(
        `Daily task notice suppressed: ${served.programmeSlug} day ${served.programmeDay} has no readable task.`,
      );
      return "suppressed";
    }

    const [inAppAllowed, emailAllowed] = await Promise.all([
      this.notifications.isDeliveryAllowed(
        { id: userId },
        DAILY_TASK_NOTICE_TYPE,
        "in_app",
      ),
      this.notifications.isDeliveryAllowed(
        { id: userId },
        DAILY_TASK_NOTICE_TYPE,
        "email",
      ),
    ]);

    const taskSummary = taskSummaryOf(task);
    // Resolved before any write: anything here that throws (a malformed
    // origin, a database blip) fails the run before a delivery row exists,
    // so the retry is a clean first attempt rather than a suppressed replay.
    const actionUrl = new URL(TASK_CARD_PATH, this.webOrigin()).toString();
    const emailAddress = emailAllowed
      ? await this.findUserEmail(userId)
      : null;

    let sentNow = false;

    if (inAppAllowed) {
      const created = await this.dataSource.transaction((manager) =>
        this.notifications.createInAppNotification(manager, {
          userId,
          notificationType: DAILY_TASK_NOTICE_TYPE,
          title: notificationRegistry[DAILY_TASK_NOTICE_TYPE].label,
          message: task.title,
          actionUrl: TASK_CARD_PATH,
          dedupeKey: `daily-task-notice:${localDate}:day-${served.programmeDay}`,
        }),
      );

      sentNow = created !== null;
    }

    // Email delivery is recorded independently of in-app: the inbox row (or
    // its deliberate absence under an in-app opt-out) says nothing about
    // whether this email went out.
    if (emailAllowed) {
      if (await this.hasEmailDelivery(userId, localDate, served.programmeDay)) {
        return sentNow ? "sent" : "suppressed";
      }

      if (!emailAddress) {
        this.logger.warn(
          `Daily task notice email skipped: no address for user ${userId}.`,
        );
        return sentNow ? "sent" : "suppressed";
      }

      const result = await this.email.sendDailyTaskNotice({
        to: emailAddress,
        taskTitle: task.title,
        ...(taskSummary !== undefined ? { taskSummary } : {}),
        actionUrl,
        idempotencyKey: `daily-task-notice/${userId}/${localDate}/day-${served.programmeDay}`,
      });

      if (!result.ok) {
        // Retryable by design: the serve layer reuses today's row, the inbox
        // dedupes, and the still-empty email ledger means the retry resends.
        // The sweep records the failed run and backs off within the morning.
        throw new DailyTaskNoticeEmailError(
          `Daily task notice email failed for ${userId} on ${localDate}: ${result.error}`,
        );
      }

      await this.recordEmailDelivery(userId, localDate, served.programmeDay);
      sentNow = true;
    }

    return sentNow ? "sent" : "suppressed";
  }

  /**
   * The task this morning's sweep served for this local date. A morning can
   * record gap rows alongside the served row (gaps are skipped through to the
   * first real task), so the latest served row for the date wins. No row
   * means a rest day or nothing served.
   */
  private async findServedDay(
    userId: string,
    localDate: string,
  ): Promise<ServedDayRow | null> {
    const [row] = (await this.dataSource.query(
      `SELECT "enrolmentId", "programmeSlug", "programmeDay", "taskId"
         FROM "programme_day_serve"
        WHERE "userId" = $1
          AND "localDate" = $2::date
          AND "outcome" = 'served'
          AND "taskId" IS NOT NULL
        ORDER BY "programmeDay" DESC
        LIMIT 1`,
      [userId, localDate],
    )) as ServedDayRow[];

    return row ?? null;
  }

  /**
   * The authored task the served row points at. Matches by id and suppresses
   * when the mirror no longer carries it — falling back to another task
   * would name something the user was not served.
   */
  private async resolveTask(
    served: ServedDayRow,
  ): Promise<ProgrammeTask | null> {
    const [enrolment] = (await this.dataSource.query(
      `SELECT "programmeVersionId"
         FROM "programme_enrolment"
        WHERE "id" = $1
        LIMIT 1`,
      [served.enrolmentId],
    )) as { programmeVersionId: string | null }[];

    const tasks = enrolment?.programmeVersionId
      ? await this.contentReader.tasksForProgrammeDayVersion(
          enrolment.programmeVersionId,
          served.programmeDay,
          this.dataSource,
        )
      : await this.contentReader.tasksForProgrammeDay(
          served.programmeSlug,
          served.programmeDay,
          this.dataSource,
        );

    return tasks.find((task) => task.id === served.taskId) ?? null;
  }

  private async hasEmailDelivery(
    userId: string,
    localDate: string,
    programmeDay: number,
  ): Promise<boolean> {
    const [row] = (await this.dataSource.query(
      `SELECT "id"
         FROM "daily_task_notice_delivery"
        WHERE "userId" = $1
          AND "localDate" = $2::date
          AND "programmeDay" = $3
          AND "channel" = 'email'
        LIMIT 1`,
      [userId, localDate, programmeDay],
    )) as { id: string }[];

    return Boolean(row);
  }

  private async recordEmailDelivery(
    userId: string,
    localDate: string,
    programmeDay: number,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "daily_task_notice_delivery"
         ("userId", "localDate", "programmeDay", "channel")
       VALUES ($1, $2::date, $3, 'email')
       ON CONFLICT ("userId", "localDate", "programmeDay", "channel") DO NOTHING`,
      [userId, localDate, programmeDay],
    );
  }

  private async findUserEmail(userId: string): Promise<string | null> {
    const [row] = (await this.dataSource.query(
      `SELECT "email" FROM "user" WHERE "id" = $1 LIMIT 1`,
      [userId],
    )) as { email: string }[];

    return row?.email ?? null;
  }

  private webOrigin(): string {
    return (
      this.configService.get<string>("auth.webOrigin") ??
      "http://localhost:3000"
    );
  }
}

function taskSummaryOf(task: ProgrammeTask): string | undefined {
  const summary = task.objective ?? task.openingLine ?? null;

  return typeof summary === "string" && summary.trim()
    ? summary.trim()
    : undefined;
}
