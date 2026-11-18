import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import { tasksForEnrolment } from "../programme-enrolment/enrolment-tasks";
import type { ProgrammeEnrolmentEntity } from "../programme-enrolment/entities/programme-enrolment.entity";
import { ledgerKeyFor } from "../programme-enrolment/ledger-key";

/**
 * How much of a journey a user did — the one definition of it.
 *
 * A user's programme history shows this per journey, and the admin
 * programme-completion report averages it across users. Both call
 * `measureEnrolmentCompletion` so the figure a user sees and the figure the
 * team aggregates can never drift apart.
 */

// Completed only: a skipped day is the user choosing not to do it, and the
// percentage answers "how much of the programme did I do".
export const COMPLETED_PROGRESS_COLUMNS = `
  "assignmentId"::text AS "ledgerKey", "taskId", "localDate"::text AS "localDate"
`;

export interface CompletedProgressRow {
  ledgerKey: string;
  taskId: string;
  localDate: string;
}

export type CompletionEnrolment = Pick<
  ProgrammeEnrolmentEntity,
  "id" | "assignmentId" | "programmeSlug" | "programmeVersionId" | "durationDays"
>;

export interface EnrolmentCompletion {
  readonly completedDays: number;
  /** Whole number, 0–100: completed days over the programme's duration. */
  readonly completionPercent: number;
}

/**
 * Completion for each journey, keyed by enrolment id.
 *
 * Progress is matched to a journey by its ledger key, not by programme, so
 * the same programme run twice is measured twice. Day numbers come from the
 * content the journey actually ran, so a republished programme with
 * reordered days does not shift old progress; journeys on the same content
 * share one read.
 */
export async function measureEnrolmentCompletion(
  contentReader: ProgrammeContentReader,
  enrolments: readonly CompletionEnrolment[],
  progress: readonly CompletedProgressRow[],
): Promise<Map<string, EnrolmentCompletion>> {
  const progressByLedgerKey = groupBy(progress, (row) => row.ledgerKey);
  const taskDays = new Map<string, Promise<Map<string, number>>>();

  const measured = await Promise.all(
    enrolments.map(async (enrolment) => {
      const dayByTask = await memo(
        taskDays,
        enrolment.programmeVersionId ?? enrolment.programmeSlug,
        async () => dayNumbersByTask(await tasksForEnrolment(contentReader, enrolment)),
      );
      const completedDays = countCompletedDays(
        progressByLedgerKey.get(ledgerKeyFor(enrolment)) ?? [],
        dayByTask,
      );

      return [
        enrolment.id,
        {
          completedDays,
          completionPercent: completionPercent(completedDays, enrolment.durationDays),
        },
      ] as const;
    }),
  );

  return new Map(measured);
}

function dayNumbersByTask(
  tasks: readonly { id: string; dayNumber?: number }[],
): Map<string, number> {
  return new Map(
    tasks.flatMap((task) =>
      task.dayNumber === undefined ? [] : [[task.id, task.dayNumber] as const],
    ),
  );
}

/**
 * A day counts only once every one of its tasks is completed. A completed task
 * the journey's content no longer carries cannot show its day was finished,
 * so it does not count.
 */
export function countCompletedDays(
  rows: readonly CompletedProgressRow[],
  dayByTask: ReadonlyMap<string, number>,
): number {
  const tasksPerDay = new Map<number, number>();
  for (const day of dayByTask.values()) {
    tasksPerDay.set(day, (tasksPerDay.get(day) ?? 0) + 1);
  }

  // Distinct task ids: the same task completed on two dates is still one task.
  const doneByDay = new Map<number, Set<string>>();
  for (const row of rows) {
    const day = dayByTask.get(row.taskId);

    if (day !== undefined) {
      doneByDay.set(day, (doneByDay.get(day) ?? new Set()).add(row.taskId));
    }
  }

  let completed = 0;
  for (const [day, done] of doneByDay) {
    if (done.size === tasksPerDay.get(day)) {
      completed += 1;
    }
  }

  return completed;
}

export function completionPercent(
  completedDays: number,
  durationDays: number,
): number {
  if (durationDays <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((completedDays / durationDays) * 100));
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const groupKey = key(row);
    const group = groups.get(groupKey);

    if (group) group.push(row);
    else groups.set(groupKey, [row]);
  }

  return groups;
}

function memo<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  let cached = cache.get(key);

  if (!cached) {
    cached = load();
    cache.set(key, cached);
  }

  return cached;
}
