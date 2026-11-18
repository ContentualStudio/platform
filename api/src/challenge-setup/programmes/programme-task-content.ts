// Deterministic task fixture retained for unit/event tests. Runtime reads use
// ProgrammeContentRepository against the published Payload -> app-Postgres
// `programme_tasks` mirror; this catalogue is not registered in a production
// module.
//
// It is a sibling of programme-content.ts rather than a field on `Programme`:
// `getWelcomeContent()` returns the whole `Programme` object and
// GET /challenge-setup/welcome serialises it verbatim, so adding a task list
// there would ship it into the Welcome Page payload and change a contract
// that file's own header says to keep stable. This file maps 1:1 onto the
// eventual `programme_tasks` mirror table instead — one row per task, keyed
// by programme id.
//
// `findProgrammeTask` / `tasksForWeek` / `tasksForProgramme` are the shape
// downstream callers depend on; the production reader implements the same
// interface against the published mirror.

export interface ProgrammeTask {
  id: string;
  title: string;
  contentType: string;
  weekIndex: number; // 1-based, contiguous per programme — a gap week can
  // never satisfy a week.completed gate.
  dayIndex: number; // 1-based position within the week, for display order.
  moduleId?: string | null;
  lessonId?: string | null;
  dayNumber?: number;
  orderWithinDay?: number;
  dayType?: "push" | "protect" | "recharge" | null;
  timeEstimateMinutes?: number | null;
  publishSlot?: boolean;
  postNumber?: number | null;
  platform?: string | null;
  cameraRequired?: boolean;
  objective?: string | null;
  openingLine?: string | null;
  whyItMatters?: unknown;
  pausePrompt?: unknown;
  outputDescription?: unknown;
  // Authored rich text the daily card turns into checklist steps.
  instructions?: unknown;
}

const contentTypeCycle = ["video", "photo", "caption", "story"] as const;

function contentTypeFor(position: number): string {
  return contentTypeCycle[(position - 1) % contentTypeCycle.length];
}

// One task per day, weeks derived from the day count (7 days per week).
function buildDailyTasks(
  programmeId: string,
  durationDays: number,
): ProgrammeTask[] {
  const tasks: ProgrammeTask[] = [];

  for (let day = 1; day <= durationDays; day += 1) {
    tasks.push({
      id: `${programmeId}-day-${day}`,
      title: `Day ${day}`,
      contentType: contentTypeFor(day),
      weekIndex: Math.ceil(day / 7),
      dayIndex: ((day - 1) % 7) + 1,
      dayNumber: day,
      orderWithinDay: 1,
    });
  }

  return tasks;
}

// A fixed number of tasks per week, for programmes whose cadence is "N tasks
// a week" rather than "one a day".
function buildWeeklyTasks(
  programmeId: string,
  weekCount: number,
  tasksPerWeek: number,
): ProgrammeTask[] {
  const tasks: ProgrammeTask[] = [];

  for (let week = 1; week <= weekCount; week += 1) {
    for (let position = 1; position <= tasksPerWeek; position += 1) {
      tasks.push({
        id: `${programmeId}-w${week}-t${position}`,
        title: `Week ${week}, Task ${position}`,
        contentType: contentTypeFor(position),
        weekIndex: week,
        dayIndex: position,
      });
    }
  }

  return tasks;
}

export const programmeTaskContent: Record<string, ProgrammeTask[]> = {
  // "1 task per day" (see programme-content.ts).
  "15-day-jumpstart": buildDailyTasks("15-day-jumpstart", 15),
  // "4-5 tasks per week".
  "30-day-foundation": buildWeeklyTasks("30-day-foundation", 4, 5),
  // "Daily".
  "30-day-growth": buildDailyTasks("30-day-growth", 30),
};

export function tasksForProgramme(programmeId: string): ProgrammeTask[] {
  return programmeTaskContent[programmeId] ?? [];
}

export function tasksForWeek(
  programmeId: string,
  weekIndex: number,
): ProgrammeTask[] {
  return tasksForProgramme(programmeId).filter(
    (task) => task.weekIndex === weekIndex,
  );
}

export function findProgrammeTask(
  programmeId: string,
  taskId: string,
): ProgrammeTask | undefined {
  return tasksForProgramme(programmeId).find((task) => task.id === taskId);
}
