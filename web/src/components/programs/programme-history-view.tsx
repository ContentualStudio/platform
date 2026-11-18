"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  History,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { programmeCoverOrNull } from "@/lib/programme-cover";
import {
  HISTORY_TABS,
  formatHistoryDate,
  historyStatusLabel,
  historyTabs,
  historyTitle,
  historyTone,
  initialHistoryTab,
  type HistoryTab,
  type HistoryTone,
} from "@/lib/programme-history";
import { cn } from "@/lib/utils";
import type {
  ProgrammeHistory,
  ProgrammeHistoryEntry,
} from "@/schemas/programme-history.schema";

interface ProgrammeHistoryViewProps {
  history: ProgrammeHistory;
  timezone: string | null;
}

const TONE_TEXT: Record<HistoryTone, string> = {
  progress: "text-accent",
  completed: "text-success",
  ended: "text-muted",
  unavailable: "text-muted",
};

const TONE_FILL: Record<HistoryTone, string> = {
  progress: "bg-accent",
  completed: "bg-success",
  ended: "bg-muted",
  unavailable: "bg-muted",
};

type LinkedTone = Exclude<HistoryTone, "unavailable">;

const ROW_HOVER: Record<LinkedTone, string> = {
  progress: "hover:border-accent hover:shadow-[0_16px_34px_rgb(249_86_22/0.16)]",
  completed: "hover:border-success hover:shadow-[0_16px_34px_rgb(52_199_89/0.18)]",
  ended: "hover:border-muted hover:shadow-[0_16px_34px_rgb(0_0_0/0.08)]",
};

const ARROW_HOVER: Record<LinkedTone, string> = {
  progress: "group-hover:border-accent group-hover:text-accent",
  completed: "group-hover:border-success group-hover:text-success",
  ended: "group-hover:border-foreground group-hover:text-foreground",
};

const ROW_CLASS =
  "flex w-full flex-wrap items-center gap-3.5 rounded-2xl border border-border bg-surface px-5.5 py-4.5 text-left min-[720px]:flex-nowrap min-[720px]:gap-5";

/**
 * Read-only: nothing here resumes, restarts or re-enrols. A row opens that
 * programme's own page, which decides what, if anything, can start.
 */
export function ProgrammeHistoryView({ history, timezone }: ProgrammeHistoryViewProps) {
  const tabs = historyTabs(history);
  const [tab, setTab] = React.useState<HistoryTab>(() => initialHistoryTab(tabs));
  const isEmpty = history.inProgress.length === 0 && history.past.length === 0;

  return (
    <main className="w-full pb-14">
      <HistoryHeader />

      {isEmpty ? (
        <EmptyHistory />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <SummaryPill count={tabs.progress.length} icon={History} label="In progress" />
            <SummaryPill count={tabs.past.length} icon={CircleCheck} label="Past" />
            <SummaryPill count={tabs.unavailable.length} icon={Lock} label="Unavailable" />
          </div>

          <div
            aria-label="Filter programme history"
            className="mt-4 flex gap-0.5 border-b border-border"
            role="tablist"
          >
            {HISTORY_TABS.map((item) => (
              <button
                aria-controls="programme-history-panel"
                aria-selected={tab === item.id}
                className={cn(
                  "relative min-h-11 px-4 text-sm font-bold text-muted transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent",
                  tab === item.id &&
                    "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent",
                )}
                id={`programme-history-tab-${item.id}`}
                key={item.id}
                onClick={() => setTab(item.id)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`programme-history-tab-${tab}`}
            className="mt-5"
            id="programme-history-panel"
            role="tabpanel"
          >
            {tabs[tab].length > 0 ? (
              <ul className="flex flex-col gap-3">
                {tabs[tab].map((entry) => (
                  <HistoryRow entry={entry} key={entry.enrolmentId} timezone={timezone} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Nothing in this view yet.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

export function HistoryHeader() {
  return (
    <header>
      <Link
        className="mb-7 inline-flex items-center gap-2 text-xs font-bold text-muted transition-colors hover:text-foreground"
        href="/dashboard"
      >
        <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2.4} />
        Home
      </Link>
      <p className="mb-3 text-base font-medium text-muted">Your journey</p>
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
        Programme history
      </h1>
      <p className="mt-2 text-sm text-muted">
        Every programme you&apos;ve started, the one you&apos;re in and the ones behind you,
        with how far you got.
      </p>
    </header>
  );
}

function SummaryPill({
  count,
  icon: Icon,
  label,
}: {
  count: number;
  icon: typeof History;
  label: string;
}) {
  return (
    <div className="flex min-w-37.5 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3">
      <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-surface text-accent">
        <Icon aria-hidden className="size-4" />
      </span>
      <span>
        <strong className="block text-sm leading-tight text-foreground">{count}</strong>
        <span className="block text-2xs text-muted">{label}</span>
      </span>
    </div>
  );
}

function HistoryRow({
  entry,
  timezone,
}: {
  entry: ProgrammeHistoryEntry;
  timezone: string | null;
}) {
  const tone = historyTone(entry);
  const content = <HistoryRowContent entry={entry} timezone={timezone} tone={tone} />;

  // A programme gone from the catalogue has no page left to open.
  if (tone === "unavailable") {
    return <li className={cn(ROW_CLASS, "border-dashed")}>{content}</li>;
  }

  return (
    <li>
      <Link
        className={cn(
          ROW_CLASS,
          "group transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          ROW_HOVER[tone],
        )}
        href={`/programs/${encodeURIComponent(entry.slug)}/welcome?from=history`}
      >
        {content}
        <span
          aria-hidden
          className={cn(
            "grid size-8.5 shrink-0 place-items-center rounded-full border border-border bg-background text-muted transition-colors",
            ARROW_HOVER[tone],
          )}
        >
          <ChevronRight className="size-4" strokeWidth={2.4} />
        </span>
      </Link>
    </li>
  );
}

function HistoryRowContent({
  entry,
  timezone,
  tone,
}: {
  entry: ProgrammeHistoryEntry;
  timezone: string | null;
  tone: HistoryTone;
}) {
  const cover = tone === "unavailable" ? null : programmeCoverOrNull(entry.slug);

  return (
    <>
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background text-muted">
        {cover ? (
          <Image alt="" className="object-cover" fill sizes="56px" src={cover} />
        ) : tone === "unavailable" ? (
          <Lock aria-hidden className="size-5" />
        ) : (
          <History aria-hidden className="size-5" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex items-center gap-3">
          <span className="truncate text-lg font-extrabold tracking-tight text-foreground">
            {historyTitle(entry)}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 text-xs font-bold",
              TONE_TEXT[tone],
            )}
          >
            <span aria-hidden className={cn("size-1.75 rounded-full", TONE_FILL[tone])} />
            {historyStatusLabel(entry)}
          </span>
        </span>
        <span className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          {entry.track ? (
            <>
              <span className="rounded-full border border-border bg-background px-2.25 py-0.75 text-xs font-bold">
                {entry.track}
              </span>
              <span aria-hidden className="size-0.75 rounded-full bg-border" />
            </>
          ) : null}
          <span>Started {formatHistoryDate(entry.startedAt, timezone)}</span>
          {entry.endedAt ? (
            <>
              <span aria-hidden className="size-0.75 rounded-full bg-border" />
              <span>
                {entry.status === "completed" ? "Completed" : "Ended"}{" "}
                {formatHistoryDate(entry.endedAt, timezone)}
              </span>
            </>
          ) : null}
        </span>
        <span
          aria-label={`${entry.completionPercent}% complete`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={entry.completionPercent}
          className="block h-2 overflow-hidden rounded-full border border-border bg-background"
          role="progressbar"
        >
          <span
            className={cn("block h-full rounded-full", TONE_FILL[tone])}
            style={{ width: `${entry.completionPercent}%` }}
          />
        </span>
      </span>

      <span className="min-w-22 shrink-0 text-left min-[720px]:text-right">
        <strong className="block text-3xl leading-none font-extrabold tracking-tight text-foreground">
          {entry.completionPercent}%
        </strong>
        <span className="text-xs font-semibold text-muted">
          {entry.completedDays} of {entry.durationDays} days
        </span>
      </span>
    </>
  );
}

function EmptyHistory() {
  return (
    <section
      aria-labelledby="history-empty-title"
      className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-16 text-center"
    >
      <span className="grid size-18 place-items-center rounded-full border border-border bg-background text-muted">
        <History aria-hidden className="size-7.5" strokeWidth={1.6} />
      </span>
      <h2
        className="mt-1 text-xl font-extrabold tracking-tight text-foreground"
        id="history-empty-title"
      >
        No programmes yet
      </h2>
      <p className="max-w-[40ch] text-sm text-muted">
        Start your first programme and it will show up here with your progress.
      </p>
      <Button asChild className="mt-2 min-h-11 rounded-full px-6">
        <Link href="/programs/available">Browse programmes</Link>
      </Button>
    </section>
  );
}
