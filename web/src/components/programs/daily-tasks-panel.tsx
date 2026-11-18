"use client";

import { ArrowRight, Check, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { calendarWindow, type ChallengeProgress } from "@/lib/challenge-progress";
import {
  buildTaskTimeline,
  dayTypeLabel,
  defaultTimelineDay,
  TASK_DAY_STATE_LABELS,
  type TaskDayState,
  type TaskTimelineDay,
} from "@/lib/daily-tasks";
import { richTextText, taskForDay } from "@/lib/programme-tasks";
import { cn } from "@/lib/utils";
import type {
  ProgrammeTask,
  ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

/**
 * The Daily Tasks tab, design direction "Welcome 3": this programme week as a
 * strip that names each kind of day, over a timeline of every task day. One
 * day is open at a time; picking a day in the strip or the timeline opens it.
 */
export function DailyTasksPanel({
  programmeTitle,
  progress,
  taskProgress,
  tasks,
}: {
  programmeTitle: string;
  progress: ChallengeProgress;
  taskProgress: ProgrammeTaskProgress[];
  tasks: ProgrammeTask[];
}) {
  const timeline = buildTaskTimeline(tasks, taskProgress, progress.currentDay);
  const [openDay, setOpenDay] = useState(() => defaultTimelineDay(timeline));
  const stateByDay = new Map(timeline.map((day) => [day.dayNumber, day.state]));

  function openFromStrip(dayNumber: number) {
    if (!stateByDay.has(dayNumber)) return;

    setOpenDay(dayNumber);
    document
      .getElementById(timelineDayId(dayNumber))
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <div className="mb-6">
        <h2 className="text-4xl font-extrabold leading-heading tracking-tight text-foreground">
          Daily Tasks
        </h2>
        <p className="mt-1 text-base text-muted">{programmeTitle}</p>
      </div>

      <WeekStrip
        onSelect={openFromStrip}
        openDay={openDay}
        progress={progress}
        stateByDay={stateByDay}
        tasks={tasks}
      />

      {timeline.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-surface p-6 text-base text-muted">
          Daily tasks will appear here once this programme&apos;s content is
          published.
        </p>
      ) : (
        <ol aria-label="Programme days" className="mt-8 grid">
          {timeline.map((day, index) => (
            <TimelineNode
              day={day}
              isLast={index === timeline.length - 1}
              key={day.dayNumber}
              onOpen={() => setOpenDay(day.dayNumber)}
              open={day.dayNumber === openDay}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function timelineDayId(dayNumber: number) {
  return `task-day-${dayNumber}`;
}

// —— Week strip ——————————————————————————————————————————————————————

const STRIP_DAY_CLASS: Record<"completed" | "today" | "other", string> = {
  // Green text on the light mint; in dark mode the pale green washes out on
  // the dark green fill, so it reads white instead.
  completed: "bg-tint-green-soft text-tint-green dark:text-foreground",
  today: "bg-accent text-accent-foreground shadow-[0_10px_24px_rgba(249,86,22,0.2)]",
  other: "bg-surface text-foreground",
};

function WeekStrip({
  progress,
  tasks,
  stateByDay,
  openDay,
  onSelect,
}: {
  progress: ChallengeProgress;
  tasks: ProgrammeTask[];
  stateByDay: Map<number, TaskDayState>;
  openDay: number | null;
  onSelect: (dayNumber: number) => void;
}) {
  const week = calendarWindow(progress.days, progress.currentDay);

  return (
    <div
      aria-label="This programme week"
      className="grid grid-cols-7 gap-2 rounded-3xl border border-border bg-background p-2.5"
    >
      {week.map((day) => {
        const state = stateByDay.get(day.dayNumber);
        const tone =
          state === "completed" ? "completed" : day.dayNumber === progress.currentDay ? "today" : "other";
        const label = dayTypeLabel(taskForDay(tasks, day.dayNumber));
        const hasTask = state !== undefined;

        return (
          <button
            aria-current={tone === "today" ? "date" : undefined}
            aria-label={`${day.weekdayLabel} ${day.dayOfMonth}, day ${day.dayNumber}, ${label}${
              state ? `, ${TASK_DAY_STATE_LABELS[state]}` : ""
            }`}
            className={cn(
              "flex min-h-20 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 transition-transform duration-200",
              STRIP_DAY_CLASS[tone],
              hasTask ? "hover:-translate-y-0.5" : "cursor-default",
              openDay === day.dayNumber && tone === "other" && "ring-2 ring-accent/40",
            )}
            disabled={!hasTask}
            key={day.date}
            onClick={() => onSelect(day.dayNumber)}
            type="button"
          >
            <span className="text-2xs font-extrabold uppercase tracking-wide">
              {day.weekdayLabel}
            </span>
            <span className="text-2xl font-bold leading-none">{day.dayOfMonth}</span>
            <span className="max-w-full truncate text-2xs font-extrabold uppercase tracking-wide">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// —— Timeline ——————————————————————————————————————————————————————————

const MARK_CLASS: Record<TaskDayState, string> = {
  completed: "bg-success text-accent-foreground",
  today: "bg-accent text-accent-foreground",
  skipped: "bg-surface text-muted",
  missed: "bg-surface text-muted",
  upcoming: "bg-surface text-muted",
};

const BODY_CLASS: Record<TaskDayState, string> = {
  completed: "bg-tint-green-soft ring-tint-green/25",
  today: "bg-accent-soft ring-accent/20",
  skipped: "bg-surface ring-border",
  missed: "bg-surface ring-border",
  upcoming: "bg-surface ring-border",
};

// Text on each body: the completed mint and the today tint each get a colour
// that stays legible in both themes.
const TITLE_CLASS: Record<TaskDayState, string> = {
  completed: "text-tint-green dark:text-foreground",
  today: "text-foreground",
  skipped: "text-foreground",
  missed: "text-foreground",
  upcoming: "text-foreground",
};

const DESC_CLASS: Record<TaskDayState, string> = {
  completed: "text-tint-green dark:text-foreground/85",
  today: "text-foreground/80",
  skipped: "text-muted",
  missed: "text-muted",
  upcoming: "text-muted",
};

const STATE_PILL_CLASS: Record<TaskDayState, string> = {
  completed: "bg-background text-tint-green dark:text-foreground",
  today: "bg-accent text-accent-foreground",
  skipped: "bg-background text-muted",
  missed: "bg-background text-muted",
  upcoming: "bg-background text-muted",
};

function TimelineNode({
  day,
  open,
  isLast,
  onOpen,
}: {
  day: TaskTimelineDay;
  open: boolean;
  isLast: boolean;
  onOpen: () => void;
}) {
  const { state, task, dayNumber } = day;
  const description = taskDescription(task);
  const head = (
    <span className="flex flex-wrap items-center justify-between gap-3">
      <span className={cn("text-base font-bold", TITLE_CLASS[state])}>
        Day {dayNumber} · {task.title}
      </span>
      <span
        className={cn(
          "whitespace-nowrap rounded-full px-3 py-1.5 text-2xs font-extrabold",
          STATE_PILL_CLASS[state],
        )}
      >
        {TASK_DAY_STATE_LABELS[state]}
      </span>
    </span>
  );

  return (
    <li className="relative flex scroll-mt-6 gap-4.5 pb-4" id={timelineDayId(dayNumber)}>
      {isLast ? null : (
        <span aria-hidden className="absolute bottom-0 left-4 top-11 w-0.5 bg-border" />
      )}
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold",
          MARK_CLASS[state],
        )}
      >
        {state === "completed" ? <Check className="size-4" strokeWidth={3} /> : dayNumber}
      </span>

      {open ? (
        <div className={cn("min-w-0 flex-1 rounded-2xl px-5.5 py-4.5 ring-1 ring-inset", BODY_CLASS[state])}>
          {head}
          {description ? (
            <p className={cn("mt-2.5 text-sm leading-normal", DESC_CLASS[state])}>{description}</p>
          ) : null}
          <TaskDetails state={state} task={task} />
        </div>
      ) : (
        <button
          aria-expanded={false}
          className={cn(
            "min-w-0 flex-1 rounded-2xl px-5.5 py-4.5 text-left ring-1 ring-inset transition-transform duration-200 hover:-translate-y-0.5",
            BODY_CLASS[state],
          )}
          onClick={onOpen}
          type="button"
        >
          {head}
          {description ? (
            <span className={cn("mt-2.5 line-clamp-1 block text-sm leading-normal", DESC_CLASS[state])}>
              {description}
            </span>
          ) : null}
        </button>
      )}
    </li>
  );
}

/** The open day's extras: time, the reflection prompt, and a way into today's task. */
function TaskDetails({ task, state }: { task: ProgrammeTask; state: TaskDayState }) {
  const prompt = richTextText(task.pausePrompt) || task.openingLine?.trim() || "";
  const minutes = task.timeEstimateMinutes;

  return (
    <>
      {minutes ? (
        <p className={cn("mt-3 flex items-center gap-1.5 text-sm font-semibold", DESC_CLASS[state])}>
          <Clock aria-hidden className="size-3.5" />
          About {minutes} min
        </p>
      ) : null}
      {prompt ? (
        <p className="mt-3.5 rounded-2xl border border-l-[3px] border-border border-l-accent bg-background px-4.5 py-4 text-sm leading-normal text-foreground">
          <strong className="font-bold">Prompt:</strong> {prompt}
        </p>
      ) : null}
      {state === "today" ? (
        <Link
          className="mt-4.5 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
          href="/dashboard"
        >
          Open today&apos;s task
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </>
  );
}

function taskDescription(task: ProgrammeTask): string | null {
  const objective = task.objective?.trim();
  if (objective) return objective;

  const output = richTextText(task.outputDescription);
  if (output) return output;

  return task.contentType || null;
}
