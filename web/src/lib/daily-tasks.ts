import { dayNumberOf, taskForDay } from "./programme-tasks";
import type {
  ProgrammeTask,
  ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

// The Daily Tasks tab (design "Welcome 3"): a week strip over a timeline of
// every task day. Kept free of React so the states can be tested.

export type TaskDayState = "completed" | "skipped" | "today" | "missed" | "upcoming";

export interface TaskTimelineDay {
  dayNumber: number;
  task: ProgrammeTask;
  state: TaskDayState;
}

export const TASK_DAY_STATE_LABELS: Record<TaskDayState, string> = {
  completed: "Completed",
  skipped: "Skipped",
  today: "Today",
  missed: "Not logged",
  upcoming: "Upcoming",
};

const DAY_TYPE_LABELS: Record<NonNullable<ProgrammeTask["dayType"]>, string> = {
  push: "Push",
  protect: "Protect",
  recharge: "Recharge",
};

/** What kind of programme day it is, for the strip. A day without a task is a rest day. */
export function dayTypeLabel(task: ProgrammeTask | undefined): string {
  if (!task) return "Rest";
  return task.dayType ? DAY_TYPE_LABELS[task.dayType] : "Task";
}

/** The latest logged outcome per task: a later log replaces an earlier one. */
export function outcomesByTask(
  records: ProgrammeTaskProgress[],
): Map<string, ProgrammeTaskProgress["outcome"]> {
  const latest = new Map<string, ProgrammeTaskProgress>();

  for (const record of records) {
    const current = latest.get(record.taskId);
    if (!current || record.recordedAt > current.recordedAt) {
      latest.set(record.taskId, record);
    }
  }

  return new Map([...latest].map(([taskId, record]) => [taskId, record.outcome]));
}

/**
 * Green is earned: a day is completed only when its task was logged as done.
 * A past day with nothing logged is "missed", never quietly treated as done.
 */
export function taskDayState(
  dayNumber: number,
  currentDay: number,
  outcome: ProgrammeTaskProgress["outcome"] | undefined,
): TaskDayState {
  if (outcome === "completed") return "completed";
  if (outcome === "skipped") return "skipped";
  if (currentDay > 0 && dayNumber === currentDay) return "today";
  if (currentDay > 0 && dayNumber < currentDay) return "missed";
  return "upcoming";
}

/** One entry per programme day that has a task, in day order. */
export function buildTaskTimeline(
  tasks: ProgrammeTask[],
  progress: ProgrammeTaskProgress[],
  currentDay: number,
): TaskTimelineDay[] {
  const outcomes = outcomesByTask(progress);
  const dayNumbers = [...new Set(tasks.map(dayNumberOf))].sort((left, right) => left - right);

  return dayNumbers.flatMap((dayNumber) => {
    const task = taskForDay(tasks, dayNumber);
    if (!task) return [];

    return [{ dayNumber, task, state: taskDayState(dayNumber, currentDay, outcomes.get(task.id)) }];
  });
}

/** The day the timeline opens on: today, else the first day still to do, else the first. */
export function defaultTimelineDay(timeline: TaskTimelineDay[]): number | null {
  return (
    timeline.find((day) => day.state === "today")?.dayNumber ??
    timeline.find((day) => day.state === "upcoming" || day.state === "missed")?.dayNumber ??
    timeline[0]?.dayNumber ??
    null
  );
}
