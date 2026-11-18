import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import type { ProgrammeEnrolmentEntity } from "../programme-enrolment/entities/programme-enrolment.entity";
import { tasksForEnrolment } from "../programme-enrolment/enrolment-tasks";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";

/** Days +1 through +6 — the planning window the week-ahead view shows. */
export const WEEK_AHEAD_WINDOW_DAYS = 6;

/**
 * One upcoming day, carrying only the fields the mirror actually authored so
 * the view can omit what is absent rather than render an empty badge.
 */
export interface UpcomingTaskDay {
  readonly dayNumber: number;
  readonly taskId: string;
  readonly title: string;
  readonly contentType?: string;
  readonly dayType?: "push" | "protect" | "recharge";
  readonly cameraRequired?: boolean;
  readonly timeEstimateMinutes?: number;
}

export interface WeekAheadView {
  /** False when the caller has no active enrolment — a state, not an error. */
  readonly hasActiveProgramme: boolean;
  readonly programmeSlug: string | null;
  /** The last programme day served; 0 before the first morning sweep. */
  readonly currentDay: number;
  readonly durationDays: number;
  /** True when the window reaches the programme's final day. */
  readonly reachesProgrammeEnd: boolean;
  readonly days: UpcomingTaskDay[];
}

const dayTypes = new Set(["push", "protect", "recharge"]);

@Injectable()
export class UpcomingTasksService {
  constructor(
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  /**
   * The next six programme days for the caller's active enrolment.
   *
   * The pointer is read from the enrolment rather than derived from the
   * calendar: `lastServedDay` is the day the user is on, so the window opens
   * at the first day that has not been served. Days the mirror has no task row
   * for are omitted, and the window never reaches past the final day.
   */
  async listUpcoming(user: AuthenticatedUser): Promise<WeekAheadView> {
    const enrolment = await this.enrolments.findActiveForUser(user.id);

    if (!enrolment) {
      return {
        hasActiveProgramme: false,
        programmeSlug: null,
        currentDay: 0,
        durationDays: 0,
        reachesProgrammeEnd: false,
        days: [],
      };
    }

    const currentDay = enrolment.lastServedDay ?? 0;
    const firstDay = currentDay + 1;
    const lastDay = Math.min(
      currentDay + WEEK_AHEAD_WINDOW_DAYS,
      enrolment.durationDays,
    );

    const days =
      firstDay > lastDay
        ? []
        : this.rowsForWindow(
            await this.tasksForEnrolment(enrolment),
            firstDay,
            lastDay,
          );

    return {
      hasActiveProgramme: true,
      programmeSlug: enrolment.programmeSlug,
      currentDay,
      durationDays: enrolment.durationDays,
      reachesProgrammeEnd:
        currentDay + WEEK_AHEAD_WINDOW_DAYS >= enrolment.durationDays,
      days,
    };
  }

  /**
   * The full authored task for one upcoming day, for the read-only preview.
   * Past days and days outside the enrolment are unreachable here — the
   * week-ahead surface is forward-looking on read as well as on list.
   */
  async findUpcomingDay(
    user: AuthenticatedUser,
    dayNumber: number,
  ): Promise<ProgrammeTask> {
    const enrolment = await this.enrolments.findActiveForUser(user.id);

    if (!enrolment) {
      throw new NotFoundException({
        code: "NO_ACTIVE_PROGRAMME",
        message: "No programme is currently active.",
      });
    }

    const currentDay = enrolment.lastServedDay ?? 0;

    if (
      !Number.isInteger(dayNumber) ||
      dayNumber <= currentDay ||
      dayNumber > enrolment.durationDays
    ) {
      throw new NotFoundException({
        code: "DAY_NOT_UPCOMING",
        message: "That day is not part of your upcoming programme days.",
      });
    }

    const task = sortByDay(await this.tasksForEnrolment(enrolment)).find(
      (candidate) => candidate.dayNumber === dayNumber,
    );

    if (!task) {
      throw new NotFoundException({
        code: "NO_TASK_FOR_DAY",
        message: "That programme day has no scheduled task.",
      });
    }

    return task;
  }

  // One read for the whole window: both readers resolve the programme's tasks
  // in a single call, so a six-day window is not six queries.
  private tasksForEnrolment(
    enrolment: ProgrammeEnrolmentEntity,
  ): Promise<ProgrammeTask[]> {
    return tasksForEnrolment(this.contentReader, enrolment);
  }

  private rowsForWindow(
    tasks: ProgrammeTask[],
    firstDay: number,
    lastDay: number,
  ): UpcomingTaskDay[] {
    const rows: UpcomingTaskDay[] = [];
    const seenDays = new Set<number>();

    for (const task of sortByDay(tasks)) {
      const dayNumber = task.dayNumber;

      if (
        typeof dayNumber !== "number" ||
        dayNumber < firstDay ||
        dayNumber > lastDay ||
        seenDays.has(dayNumber)
      ) {
        continue;
      }

      seenDays.add(dayNumber);
      rows.push(toUpcomingDay(task, dayNumber));
    }

    return rows;
  }
}

/** Day order first, then the authored order within a day. */
function sortByDay(tasks: ProgrammeTask[]): ProgrammeTask[] {
  return [...tasks].sort(
    (left, right) =>
      (left.dayNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.dayNumber ?? Number.MAX_SAFE_INTEGER) ||
      (left.orderWithinDay ?? 0) - (right.orderWithinDay ?? 0) ||
      left.id.localeCompare(right.id),
  );
}

function toUpcomingDay(
  task: ProgrammeTask,
  dayNumber: number,
): UpcomingTaskDay {
  const dayType =
    typeof task.dayType === "string" && dayTypes.has(task.dayType)
      ? (task.dayType as "push" | "protect" | "recharge")
      : undefined;
  const contentType = task.contentType?.trim() ? task.contentType : undefined;

  return {
    dayNumber,
    taskId: task.id,
    title: task.title,
    ...(contentType ? { contentType } : {}),
    ...(dayType ? { dayType } : {}),
    ...(task.cameraRequired ? { cameraRequired: true } : {}),
    ...(typeof task.timeEstimateMinutes === "number"
      ? { timeEstimateMinutes: task.timeEstimateMinutes }
      : {}),
  };
}
