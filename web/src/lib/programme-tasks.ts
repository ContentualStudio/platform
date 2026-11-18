import type { ChallengeDay } from "@/lib/challenge-progress";
import type { ProgrammeTask } from "@/schemas/programme-task.schema";

export function dayNumberOf(task: ProgrammeTask): number {
  return task.dayNumber ?? (task.weekIndex - 1) * 7 + task.dayIndex;
}

export function taskForDay(
  tasks: ProgrammeTask[],
  dayNumber: number,
): ProgrammeTask | undefined {
  const dayTasks = tasks
    .filter((task) => dayNumberOf(task) === dayNumber)
    .sort(
      (left, right) =>
        Number(left.orderWithinDay ?? 0) - Number(right.orderWithinDay ?? 0),
    );

  return dayTasks[0];
}

export function nextTaskForDay(
  tasks: ProgrammeTask[],
  dayNumber: number,
): ProgrammeTask | undefined {
  return taskForDay(tasks, dayNumber + 1);
}

/** Pull plain checklist lines from authored Lexical-style instructions. */
export function checklistStepsFromTask(task: ProgrammeTask): string[] {
  const lines = richTextLines(task.instructions);

  if (lines.length > 0) {
    return lines;
  }

  return [task.title];
}

/**
 * Authored rich text as plain lines. Payload hands these fields over as
 * Lexical trees, but the mirror has carried plain strings in the past, so both
 * are read and anything else collapses to no lines at all.
 */
export function richTextLines(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const root = (value as { root?: { children?: unknown[] } }).root;

  if (!root?.children) {
    return [];
  }

  const lines: string[] = [];

  for (const child of root.children) {
    const text = nodeText(child).trim();

    if (text) {
      lines.push(text);
    }
  }

  return lines;
}

function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const record = node as { text?: string; children?: unknown[] };

  if (typeof record.text === "string") {
    return record.text;
  }

  if (!Array.isArray(record.children)) {
    return "";
  }

  return record.children.map(nodeText).join("");
}

/** The same authored rich text as one paragraph. */
export function richTextText(value: unknown): string {
  return richTextLines(value).join(" ").trim();
}

/**
 * What the daily task card says when the day carries no task. A programme with
 * authored tasks and a gap on this day is a rest day and says so; a programme
 * with no tasks at all is content that has not landed yet, which is a
 * different thing to tell someone who is wondering what is broken.
 */
export function dailyTaskEmptyState(
  state: ChallengeDay["state"],
  hasAuthoredTasks: boolean,
): { title: string; body: string } {
  if (!hasAuthoredTasks) {
    return {
      title: "No task scheduled",
      body: "Tasks for this day will appear once programme content is available.",
    };
  }

  if (state === "upcoming") {
    return {
      title: "Nothing scheduled",
      body: "This day has no task. The next one is waiting further along your programme.",
    };
  }

  return {
    title: "Rest day",
    body: "There is nothing to do today. Your programme picks up again tomorrow - no streak lost, nothing to log.",
  };
}
