"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Flame,
  History,
  Send,
} from "lucide-react";
import {
  completeProgrammeTaskAction,
  skipProgrammeTaskAction,
} from "@/actions/programme-tasks";
import { claimStudioLessonNudgeAction } from "@/actions/studio-lesson-nudges";
import { PostTaskLessonNudge } from "@/components/dashboard/post-task-lesson-nudge";
import type { StudioLessonNudge } from "@/lib/studio-lesson-nudge";
import { WeeklyMomentumCard } from "@/components/dashboard/weekly-momentum-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  calendarDateKey,
  calendarStripAroundToday,
  type CalendarStripDay,
  type ChallengeDay,
  type ChallengeProgress,
} from "@/lib/challenge-progress";
import {
  checklistStepsFromTask,
  dailyTaskEmptyState,
  dayNumberOf,
  nextTaskForDay,
  richTextText,
  taskForDay,
} from "@/lib/programme-tasks";
import { dayTypeLabel } from "@/lib/daily-tasks";
import { cn } from "@/lib/utils";
import type {
  ProgrammeTask,
  ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

interface DailyCockpitDashboardProps {
  programmeTitle: string;
  programmeDescription: string;
  progress: ChallengeProgress;
  taskProgress: ProgrammeTaskProgress[];
  tasks: ProgrammeTask[];
  timezone: string | null;
}

type Outcome = "completed" | "skipped";

const DAY_TYPE_LABELS: Record<string, string> = {
  push: "Push",
  protect: "Protect",
  recharge: "Recharge",
};

// The CMS stores machine values so the event contract stays stable; the card
// is the one place that turns them back into the platform's own spelling.
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
};

export function DailyCockpitDashboard({
  programmeTitle,
  programmeDescription,
  progress,
  taskProgress,
  tasks,
  timezone,
}: DailyCockpitDashboardProps) {
  const todayDateKey = React.useMemo(
    () => calendarDateKey(timezone),
    [timezone],
  );
  const defaultDay = React.useMemo(
    () => resolveSelectedDay(progress, todayDateKey),
    [progress, todayDateKey],
  );
  const [selectedDay, setSelectedDay] = React.useState(defaultDay);
  const selectedCalendarDay = progress.days[selectedDay - 1];
  const selectedTask = taskForDay(tasks, selectedDay);
  const steps = selectedTask ? checklistStepsFromTask(selectedTask) : [];
  const [checkedSteps, setCheckedSteps] = React.useState<boolean[]>([]);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [reflection, setReflection] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [isCelebrating, setIsCelebrating] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [lessonNudge, setLessonNudge] = React.useState<
    (StudioLessonNudge & { taskId: string }) | null
  >(null);
  // The server is the source of truth for whether a day is resolved: browser
  // storage would re-enable the actions on a new device, and the write would
  // then be silently refused.
  const [recordedOutcomes, setRecordedOutcomes] = React.useState(
    () => recordsByTask(taskProgress),
  );
  const checkInRef = React.useRef<HTMLElement | null>(null);
  const completeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const visibleDays = React.useMemo(
    () => calendarStripAroundToday(progress.days, timezone),
    [progress.days, timezone],
  );
  const nextTask = nextTaskForDay(tasks, selectedDay);
  const recordedOutcome = selectedTask
    ? (recordedOutcomes[selectedTask.id] ?? null)
    : null;
  // A day the programme deliberately left empty, as opposed to a programme
  // whose content has not arrived — the two read very differently to a user
  // who is wondering whether something is broken.
  const isRestDay = !selectedTask && tasks.length > 0;
  const stepCount = checkedSteps.filter(Boolean).length;
  const stepProgress =
    steps.length > 0 ? Math.round((stepCount / steps.length) * 100) : 0;
  const dayState = selectedCalendarDay?.state ?? "upcoming";
  const emptyState = dailyTaskEmptyState(dayState, tasks.length > 0);
  const canInteract =
    dayState === "active" && Boolean(selectedTask) && !recordedOutcome;
  const streakDays = Math.max(0, progress.currentDay - 1);

  React.useEffect(() => {
    setSelectedDay(resolveSelectedDay(progress, todayDateKey));
  }, [progress, todayDateKey]);

  React.useEffect(() => {
    setRecordedOutcomes(recordsByTask(taskProgress));
  }, [taskProgress]);

  React.useEffect(() => {
    if (!selectedTask) {
      setCheckedSteps([]);
      setOutcome(null);
      setReflection("");
      setFeedback(null);
      return;
    }

    // The checklist and the reflection are per-device conveniences; the
    // outcome itself comes from the server record.
    setCheckedSteps(readChecklist(selectedTask.id, steps.length));
    const recorded = recordedOutcomes[selectedTask.id] ?? null;
    setOutcome(recorded?.outcome ?? null);
    setReflection(readReflection(selectedTask.id));
    setFeedback(recorded ? resolvedCopy(recorded) : null);
  }, [recordedOutcomes, selectedTask, steps.length]);

  async function saveActivity() {
    if (!selectedTask || !outcome || isSaving || recordedOutcome) {
      return;
    }

    setIsSaving(true);

    const action =
      outcome === "completed"
        ? completeProgrammeTaskAction
        : skipProgrammeTaskAction;
    const result = await action({ taskId: selectedTask.id });

    setIsSaving(false);

    // A failure leaves the day unresolved, so the actions stay live and a
    // retry writes at most once — the server's own gate is what guarantees it.
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }

    const record = result.data.progress;
    writeReflection(selectedTask.id, reflection);
    setRecordedOutcomes((current) => ({ ...current, [record.taskId]: record }));
    setOutcome(record.outcome);

    if (record.outcome === "completed") {
      // Optional follow-up: completion is already saved, and its feedback does
      // not wait for the nudge. The server arbitrates once-per-category claims.
      void claimStudioLessonNudgeAction({ taskId: record.taskId })
        .then((nudge) => {
          if (nudge.ok && nudge.data) {
            setLessonNudge({ ...nudge.data, taskId: record.taskId });
          }
        })
        .catch(() => {
          // Completion remains successful if lessons are unavailable.
        });
    }

    // A retry can recover an unshown nudge, but never celebrates twice.
    if (result.data.recorded && record.outcome === "completed") {
      setIsCelebrating(true);
      window.setTimeout(() => setIsCelebrating(false), 820);
    }

    setFeedback(
      result.data.recorded
        ? savedFeedbackCopy(record.outcome)
        : resolvedCopy(record),
    );
  }

  function toggleStep(index: number) {
    if (!selectedTask || !canInteract) {
      return;
    }

    setCheckedSteps((current) => {
      const next = [...current];
      next[index] = !next[index];
      writeChecklist(selectedTask.id, next);
      return next;
    });
  }

  // Moves the user to the actions rather than to another page: scrolled into
  // view for everyone, focused for anyone driving this from the keyboard.
  function focusCheckIn() {
    checkInRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    completeButtonRef.current?.focus({ preventScroll: true });
  }

  function selectOutcome(next: Outcome) {
    if (!canInteract) {
      return;
    }

    setOutcome(next);
    setFeedback("Save activity to record today's outcome.");
  }

  const statusPills = (
    <>
      <StatusPill
        icon={CalendarDays}
        label="Current programme"
        value={`Day ${progress.currentDay || 1} of ${progress.totalDays}`}
      />
      <StatusPill
        icon={Flame}
        label="Current rhythm"
        value={`${streakDays} day streak`}
      />
      <StatusPill
        icon={Clock}
        label={programmeTitle}
        value={`${progress.progressPercent}% complete`}
      />
    </>
  );

  function outcomeForDay(dayNumber: number | null): Outcome | null {
    const task = dayNumber ? taskForDay(tasks, dayNumber) : undefined;
    return task ? (recordedOutcomes[task.id]?.outcome ?? null) : null;
  }

  const calendarStrip = (
    <div
      aria-label="This week's programme activity"
      className="grid grid-cols-7 gap-2 rounded-[24px] border border-border bg-background p-2.5"
    >
      {visibleDays.map((day) => (
        <DayButton
          day={day}
          key={day.date}
          onSelect={() => {
            if (day.dayNumber) {
              setSelectedDay(day.dayNumber);
            }
          }}
          outcome={outcomeForDay(day.dayNumber)}
          dayLabel={dayTypeLabel(day.dayNumber ? taskForDay(tasks, day.dayNumber) : undefined)}
          hasTask={day.dayNumber ? Boolean(taskForDay(tasks, day.dayNumber)) : false}
          selected={day.dayNumber === selectedDay}
          todayDateKey={todayDateKey}
        />
      ))}
    </div>
  );

  const editorialStrip = (
    <section
      aria-label="Today's programme focus"
      className="relative flex min-h-46 items-end overflow-hidden rounded-[28px] px-7 py-6.5 text-white"
    >
      <Image
        alt=""
        aria-hidden
        className="object-cover object-[center_45%]"
        fill
        priority
        sizes="(min-width: 1024px) 900px, 100vw"
        src="/brand/auth-creator-phone.jpg"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,9,7,0.9)_0%,rgba(13,9,7,0.58)_43%,rgba(13,9,7,0.08)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(135deg,rgba(249,86,22,0.22),transparent_52%)]"
      />
      <div className="relative z-1 max-w-140">
        <div className="mb-2.5 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em]">
          <i className="size-1.5 rounded-full bg-accent" />
          Day {progress.currentDay || 1} · {programmeTitle}
        </div>
        <h2
          className="mb-1.5 text-[29px] leading-[1.08] tracking-tight"
        >
          {selectedTask?.title ?? "One clear action today."}
        </h2>
        <p
          className="max-w-120 text-sm text-white/78"
        >
          {selectedTask
            ? taskDescription(selectedTask, programmeDescription)
            : "Shape today's work so tomorrow feels simple."}
        </p>
      </div>
    </section>
  );

  const taskCtaClass = "relative h-11.5 rounded-full bg-accent px-5.5 text-sm font-bold text-white hover:opacity-90";

  const taskCard = (
    <section
      aria-labelledby="today-task-title"
      className="relative min-h-115 w-full overflow-hidden rounded-[30px] bg-surface p-7.5"
    >
      <p
        className="relative mb-2 text-[11px] font-extrabold uppercase tracking-[0.09em] text-accent"
      >
        Today&apos;s task
      </p>
      <div className="relative mb-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2
            className="text-[30px] font-bold leading-[1.12] tracking-tight text-foreground"
            id="today-task-title"
          >
            {selectedTask?.title ?? emptyState.title}
          </h2>
          <p
            className="mt-2 text-sm leading-relaxed text-muted"
          >
            {selectedTask
              ? taskDescription(selectedTask, programmeDescription)
              : emptyState.body}
          </p>
        </div>
        <TaskStateBadge
          inverted={false}
          isRestDay={isRestDay}
          outcome={recordedOutcome?.outcome ?? null}
          state={dayState}
        />
      </div>

      {selectedTask ? (
        <TaskMeta inverted={false} task={selectedTask} />
      ) : null}

      {steps.length > 0 ? (
        <>
          <div
            className="relative mb-2 flex justify-between gap-3.5 text-xs font-semibold text-muted"
          >
            <span>
              {stepCount} of {steps.length} steps complete
            </span>
            {typeof selectedTask?.timeEstimateMinutes === "number" ? (
              <span>About {selectedTask.timeEstimateMinutes} min</span>
            ) : null}
          </div>
          <div
            className="relative mb-5 h-1.5 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${stepProgress}%` }}
            />
          </div>
          <div
            aria-label="Task checklist"
            className="relative mb-6 grid grid-cols-1 gap-2.25 sm:grid-cols-2"
          >
            {steps.map((step, index) => {
              const complete = checkedSteps[index] ?? false;

              return (
                <button
                  aria-pressed={complete}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-[17px] border border-transparent bg-background px-3.25 py-3.25 text-left text-xs font-semibold leading-snug transition-colors",
                    complete
                      ? "text-foreground"
                      : "text-muted hover:border-border hover:text-foreground",
                    !canInteract && "cursor-default opacity-70",
                  )}
                  disabled={!canInteract}
                  key={step}
                  onClick={() => toggleStep(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-transparent",
                      complete && "border-success bg-success text-white",
                    )}
                  >
                    {complete ? (
                      <Check aria-hidden className="size-3.5" strokeWidth={3} />
                    ) : null}
                  </span>
                  {step}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {/*
        Complete and skip live in the check-in card beside this one, so the
        card's own action moves to them rather than off the surface. Once the
        day is resolved there is nothing left to log and the link becomes the
        way back out to the whole plan.
      */}
      {canInteract ? (
        <Button className={taskCtaClass} onClick={focusCheckIn} type="button">
          Log today&apos;s task
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      ) : (
        <Button asChild className={taskCtaClass}>
          <Link href="/programs?tab=tasks">
            View your programme
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      )}
    </section>
  );

  const checkInCard = (
    <section
      aria-labelledby="daily-checkin-title"
      ref={checkInRef}
      className={cn(
        "relative isolate min-h-115 w-full overflow-hidden rounded-[30px] bg-surface p-7.5",
        isCelebrating && "motion-safe:animate-[pulse_720ms_ease-out_1]",
      )}
    >
      {isCelebrating ? (
        <div
          aria-hidden
          className="pointer-events-none absolute right-5 top-5 flex size-14 items-center justify-center rounded-full bg-success text-primary-foreground shadow-soft"
        >
          <Check className="size-5" strokeWidth={2.8} />
        </div>
      ) : null}
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.09em] text-accent">
        Daily check-in
      </p>
      <h2
        className="text-[30px] font-bold leading-[1.12] tracking-tight text-foreground"
        id="daily-checkin-title"
      >
        Log activity
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        How did today&apos;s{" "}
        {selectedTask?.title.toLowerCase().includes("script")
          ? "script task"
          : "task"}{" "}
        go?
      </p>

      <div
        aria-label="Choose an activity outcome"
        className="my-4.5 grid grid-cols-2 gap-2.5"
        role="group"
      >
        <OutcomeButton
          active={outcome === "completed"}
          buttonRef={completeButtonRef}
          disabled={!canInteract}
          icon={CircleCheck}
          label="Completed"
          onClick={() => selectOutcome("completed")}
        />
        <OutcomeButton
          active={outcome === "skipped"}
          disabled={!canInteract}
          icon={CircleX}
          label="Skipped"
          onClick={() => selectOutcome("skipped")}
        />
      </div>

      <label
        className="mb-2 block text-xs font-bold text-muted"
        htmlFor="daily-reflection"
      >
        Quick reflection <span className="font-medium">(optional)</span>
      </label>
      <textarea
        className="min-h-15 w-full resize-y rounded-2xl border border-border bg-background px-3.5 py-3 text-xs font-medium leading-snug text-foreground outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/10"
        disabled={!canInteract}
        id="daily-reflection"
        maxLength={180}
        onChange={(event) => setReflection(event.target.value)}
        placeholder="Anything you want to remember for tomorrow?"
        value={reflection}
      />

      <Button
        className="mt-3 h-11.5 w-full rounded-full bg-accent text-sm font-bold text-white hover:opacity-90"
        disabled={!canInteract || !outcome || isSaving}
        onClick={() => void saveActivity()}
        type="button"
      >
        {isSaving ? <Spinner className="size-4" /> : null}
        Save activity
      </Button>

      <p
        aria-live="polite"
        className={cn(
          "mt-3 min-h-4 text-xs font-semibold",
          recordedOutcome ? "text-success" : "text-muted",
        )}
        role="status"
      >
        {feedback ??
          (canInteract
            ? "Choose an outcome to log today's task."
            : isRestDay
              ? "Nothing to log on a rest day."
              : "Check-in opens on your active programme day.")}
      </p>

      {lessonNudge && lessonNudge.taskId === selectedTask?.id && recordedOutcome?.outcome === "completed" ? (
        <PostTaskLessonNudge nudge={lessonNudge} onDismiss={() => setLessonNudge(null)} />
      ) : null}

      {recordedOutcome ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border pt-4">
          <MiniStat
            icon={Flame}
            label="Current streak"
            value={`${streakDays} days`}
          />
          <MiniStat
            icon={Clock}
            label="Challenge progress"
            value={`${progress.progressPercent}%`}
          />
        </div>
      ) : null}
    </section>
  );

  const upNextCard = (
    <section className="flex min-h-31.5 items-center justify-between gap-5.5 rounded-[30px] bg-surface px-6.5 py-6">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">
          Up next
        </p>
        <p className="mt-1 text-[22px] font-extrabold tracking-tight text-foreground">
          {nextTask?.title ?? "Programme complete"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {nextTask
            ? `Unlocks on day ${dayNumberOf(nextTask)}`
            : "You have reached the final day."}
        </p>
        {/* The planning surface: this card names one day, the week-ahead
            view names the next six. */}
        <Link
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
          href="/week-ahead"
        >
          See the week ahead
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        <Link
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
          href="/programs/available"
        >
          Browse programmes
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      {nextTask ? (
        <Button
          aria-label="Preview next task"
          className="size-11.5 shrink-0 rounded-full bg-background hover:bg-accent hover:text-white"
          onClick={() => setSelectedDay(dayNumberOf(nextTask))}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      ) : null}
    </section>
  );

  return (
    <main className="w-full pb-14">
      <div className="flex flex-col gap-5.5">
        {editorialStrip}

        <section
          aria-label="Your current programme status"
          className="grid grid-cols-1 items-center gap-4.5 xl:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="shrink-0">{calendarStrip}</div>
          <div className="flex items-stretch gap-2 max-xl:grid max-xl:grid-cols-3">
            {statusPills}
          </div>
        </section>

        {/* Up next sits under today's task and the weekly pulse under the
            check-in, so each column reads top-down as one thread. */}
        <div className="grid items-start gap-5.5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="flex min-w-0 flex-col gap-5.5">
            {taskCard}
            {upNextCard}
          </div>
          <div className="flex min-w-0 flex-col gap-5.5">
            {checkInCard}
            <WeeklyMomentumCard />
          </div>
        </div>

        <Link
          className="group flex min-h-22 items-center gap-5 rounded-xl bg-accent/10 px-6.5 py-4 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-accent/15 hover:shadow-[0_16px_34px_rgb(249_86_22/0.18)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          href="/programs/history"
        >
          <span
            aria-hidden
            className="grid size-11.5 shrink-0 place-items-center rounded-full bg-background text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
          >
            <History className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-extrabold uppercase tracking-wide text-accent">
              Your journey
            </span>
            <span className="block text-xl font-bold tracking-tight text-foreground">
              Programme history
            </span>
            <span className="block text-sm text-muted">
              Review in-progress and completed programmes
            </span>
          </span>
        </Link>
      </div>
    </main>
  );
}

function resolveSelectedDay(
  progress: ChallengeProgress,
  todayDateKey: string,
): number {
  if (progress.currentDay > 0) {
    return progress.currentDay;
  }

  return (
    progress.days.find((day) => day.date === todayDateKey)?.dayNumber ?? 1
  );
}

function DayButton({
  day,
  dayLabel,
  hasTask,
  outcome,
  selected,
  todayDateKey,
  onSelect,
}: {
  day: CalendarStripDay;
  /** The kind of programme day ("Push", "Rest"…), shown under the date. */
  dayLabel: string;
  hasTask: boolean;
  outcome: Outcome | null;
  selected: boolean;
  todayDateKey: string;
  onSelect: () => void;
}) {
  const isToday = day.date === todayDateKey;
  const statusLabel = dayStatusLabel(day, todayDateKey, hasTask, outcome);

  return (
    <button
      aria-current={isToday ? "date" : undefined}
      aria-label={`${day.weekdayLabel} ${day.dayOfMonth}${
        day.dayNumber ? `, day ${day.dayNumber}` : ""
      }, ${dayLabel}${isToday ? ", today" : `, ${statusLabel}`}`}
      className={cn(
        "flex h-17 min-w-0 flex-col items-center justify-center gap-px rounded-[18px] border-0 font-inherit transition-[transform,background,color,box-shadow] duration-200",
        DAY_STATUS_CLASS[statusLabel],
        selected && !isToday && "ring-2 ring-accent/40",
        !day.dayNumber && "cursor-default",
      )}
      disabled={!day.dayNumber}
      onClick={onSelect}
      type="button"
    >
      <span className="text-2xs font-extrabold uppercase">
        {day.weekdayLabel}
      </span>
      <span className="text-[21px] font-bold leading-none">
        {day.dayOfMonth}
      </span>
      <span className="mt-0.5 max-w-full truncate px-1 text-2xs font-extrabold uppercase tracking-wide">
        {dayLabel}
      </span>
    </button>
  );
}

// Background follows the same status as the label underneath, so a done day
// reads green at a glance and a rest day stays quiet.
const DAY_STATUS_CLASS = {
  Today: "bg-accent text-white shadow-[0_10px_24px_rgba(249,86,22,0.2)]",
  // Green text on the light mint; on the dark green fill the pale green text
  // washes out, so dark mode reads white instead.
  Done: "bg-tint-green-soft text-tint-green hover:-translate-y-0.5 dark:text-foreground",
  Skipped: "bg-surface text-muted hover:-translate-y-0.5 hover:text-foreground",
  "Not logged": "bg-surface text-muted hover:-translate-y-0.5 hover:text-foreground",
  Rest: "bg-surface text-muted hover:-translate-y-0.5 hover:text-foreground",
} as const;

type DayStatus = keyof typeof DAY_STATUS_CLASS;

// Green is earned: a past day only reads "Done" when its task was logged as
// completed, so the strip is a record of the work rather than of the calendar.
function dayStatusLabel(
  day: CalendarStripDay,
  todayDateKey: string,
  hasTask: boolean,
  outcome: Outcome | null,
): DayStatus {
  if (day.date === todayDateKey) {
    return "Today";
  }

  if (!day.isProgrammeDay || !hasTask) {
    return "Rest";
  }

  if (outcome === "completed") {
    return "Done";
  }

  if (outcome === "skipped") {
    return "Skipped";
  }

  return day.date < todayDateKey ? "Not logged" : "Rest";
}

function StatusPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="relative flex min-w-28 items-center gap-2.5 rounded-[20px] border border-border bg-background px-3.5 py-3.25">
      <span className="grid size-8.5 shrink-0 place-items-center rounded-xl bg-surface text-accent">
        <Icon aria-hidden className="size-4.25" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">{label}</p>
      </div>
    </div>
  );
}

/**
 * The authored fields that sit alongside the title. Every one is optional in
 * the CMS, so each renders only when the content team populated it and the row
 * disappears entirely when none of them did — no empty placeholders.
 */
function TaskMeta({
  inverted,
  task,
}: {
  inverted: boolean;
  task: ProgrammeTask;
}) {
  const dayType = task.dayType ? DAY_TYPE_LABELS[task.dayType] : null;
  const platform = task.platform ? PLATFORM_LABELS[task.platform] : null;
  const objective = task.objective?.trim();
  const openingLine = task.openingLine?.trim();
  const whyItMatters = richTextText(task.whyItMatters);
  const pausePrompt = richTextText(task.pausePrompt);
  const lessonId = task.lessonId ?? null;
  const chips: React.ReactNode[] = [];

  if (dayType) {
    chips.push(
      <span
        className={cn(
          "rounded-full px-3 py-1.5 text-2xs font-extrabold uppercase",
          task.dayType === "push" && "bg-accent/12 text-accent",
          task.dayType === "protect" && "bg-success/15 text-success",
          task.dayType === "recharge" && "bg-control text-muted",
          inverted && "bg-black/18 text-background",
        )}
        key="day-type"
      >
        {dayType}
      </span>,
    );
  }

  if (platform) {
    chips.push(
      <span
        className={cn(
          "rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted",
          inverted && "bg-black/18 text-background",
        )}
        key="platform"
      >
        {platform}
      </span>,
    );
  }

  if (task.cameraRequired) {
    chips.push(
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted",
          inverted && "bg-black/18 text-background",
        )}
        key="camera"
      >
        <Camera aria-hidden className="size-3.5" />
        Camera needed
      </span>,
    );
  }

  if (task.publishSlot) {
    chips.push(
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted",
          inverted && "bg-black/18 text-background",
        )}
        key="publish-slot"
      >
        <Send aria-hidden className="size-3.5" />
        Publish slot
      </span>,
    );
  }

  if (typeof task.postNumber === "number") {
    chips.push(
      <span
        className={cn(
          "rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted",
          inverted && "bg-black/18 text-background",
        )}
        key="post-number"
      >
        Post {task.postNumber}
      </span>,
    );
  }

  if (lessonId) {
    chips.push(
      <Link
        className={cn(
          "flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-accent hover:underline",
          inverted && "bg-black/18 text-background",
        )}
        href={`/studio?lesson=${encodeURIComponent(lessonId)}`}
        key="studio-module"
      >
        <BookOpen aria-hidden className="size-3.5" />
        Open in Studio
      </Link>,
    );
  }

  const notes: { key: string; label: string; body: string }[] = [];

  if (objective) {
    notes.push({ key: "objective", label: "Objective", body: objective });
  }

  if (whyItMatters) {
    notes.push({
      key: "why-it-matters",
      label: "Why it matters",
      body: whyItMatters,
    });
  }

  if (openingLine) {
    notes.push({ key: "opening-line", label: "Opening line", body: openingLine });
  }

  if (pausePrompt) {
    notes.push({ key: "pause-prompt", label: "Pause on", body: pausePrompt });
  }

  if (chips.length === 0 && notes.length === 0) {
    return null;
  }

  return (
    <div className="relative mb-4">
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">{chips}</div>
      ) : null}
      {notes.length > 0 ? (
        <dl className="mt-3 flex flex-col gap-2.5">
          {notes.map((note) => (
            <div
              className={cn(
                "border-l-2 border-accent pl-3",
                inverted && "border-background/40",
              )}
              key={note.key}
            >
              <dt
                className={cn(
                  "text-2xs font-extrabold uppercase text-accent",
                  inverted && "text-background/78",
                )}
              >
                {note.label}
              </dt>
              <dd
                className={cn(
                  "text-xs font-medium leading-loose text-muted",
                  inverted && "text-background/78",
                )}
              >
                {note.body}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function TaskStateBadge({
  state,
  isRestDay = false,
  outcome,
  inverted = false,
}: {
  state: ChallengeDay["state"];
  isRestDay?: boolean;
  outcome: Outcome | null;
  inverted?: boolean;
}) {
  if (outcome === "completed") {
    return (
      <span
        className={cn(
          "rounded-full bg-success/15 px-3 py-2 text-2xs font-extrabold uppercase text-success",
          inverted && "bg-black/18 text-white",
        )}
      >
        Logged
      </span>
    );
  }

  if (outcome === "skipped") {
    return (
      <span
        className={cn(
          "rounded-full bg-control px-3 py-2 text-2xs font-extrabold uppercase text-muted",
          inverted && "bg-black/18 text-white",
        )}
      >
        Skipped
      </span>
    );
  }

  return (
    <span
      className={cn(
        "rounded-full bg-background px-3 py-2 text-2xs font-extrabold uppercase text-muted",
        inverted && "bg-black/18 text-white",
      )}
    >
      {isRestDay
        ? "Rest"
        : state === "active"
          ? "In progress"
          : state === "upcoming"
            ? "Upcoming"
            : "Complete"}
    </span>
  );
}

function OutcomeButton({
  active,
  buttonRef,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  disabled: boolean;
  icon: typeof CircleCheck;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      ref={buttonRef}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[19px] border border-border bg-background text-xs font-bold transition-[border-color,background,transform] duration-200",
        active && "border-accent bg-accent/10 text-accent shadow-[0_0_0_2px_rgba(249,86,22,0.08)]",
        !active && "hover:-translate-y-px hover:border-accent",
        disabled && "cursor-not-allowed opacity-60",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </button>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[17px] bg-background px-3 py-3">
      <Icon aria-hidden className="size-5.75 shrink-0 text-accent" />
      <div>
        <p className="text-[19px] font-extrabold leading-none text-foreground">
          {value}
        </p>
        <p className="mt-1 text-[9px] font-bold uppercase text-muted">{label}</p>
      </div>
    </div>
  );
}

function taskDescription(task: ProgrammeTask, fallback: string) {
  return richTextText(task.outputDescription) || fallback;
}

function recordsByTask(
  records: ProgrammeTaskProgress[],
): Record<string, ProgrammeTaskProgress> {
  return Object.fromEntries(records.map((record) => [record.taskId, record]));
}

/** What the card says once a day is resolved, on this device or another. */
function resolvedCopy(record: ProgrammeTaskProgress) {
  const at = new Date(record.recordedAt);
  const stamp = Number.isNaN(at.getTime())
    ? null
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const what =
    record.outcome === "completed"
      ? "Completed"
      : "Skipped - this day is at risk, and the programme carries on";

  return stamp ? `${what} at ${stamp}.` : `${what}.`;
}

function savedFeedbackCopy(outcome: Outcome) {
  return outcome === "completed"
    ? "Activity saved. Nice work today."
    : "Activity saved. Tomorrow is a fresh start.";
}

function readChecklist(taskId: string, length: number): boolean[] {
  if (typeof window === "undefined") {
    return Array.from({ length }, () => false);
  }

  try {
    const raw = window.localStorage.getItem(`contentual:dashboard:checklist:${taskId}`);
    const parsed = raw ? (JSON.parse(raw) as boolean[]) : [];

    return Array.from({ length }, (_, index) => Boolean(parsed[index]));
  } catch {
    return Array.from({ length }, () => false);
  }
}

function writeChecklist(taskId: string, values: boolean[]) {
  window.localStorage.setItem(
    `contentual:dashboard:checklist:${taskId}`,
    JSON.stringify(values),
  );
}

function readReflection(taskId: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return (
      window.localStorage.getItem(
        `contentual:dashboard:reflection:${taskId}`,
      ) ?? ""
    );
  } catch {
    return "";
  }
}

function writeReflection(taskId: string, value: string) {
  try {
    window.localStorage.setItem(
      `contentual:dashboard:reflection:${taskId}`,
      value,
    );
  } catch {
    // The reflection is a convenience; losing it must not fail the save.
  }
}
