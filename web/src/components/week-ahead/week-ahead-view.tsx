import Link from "next/link";
import { Camera, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UpcomingTaskDay, WeekAhead } from "@/schemas/week-ahead.schema";

const DAY_TYPE_LABELS: Record<string, string> = {
  push: "Push",
  protect: "Protect",
  recharge: "Recharge",
};

/**
 * The next six programme days, read-only. Complete and skip belong to today's
 * task card; this view exists so a camera day or a heavier task is never a
 * surprise on the morning it lands.
 */
export function WeekAheadView({ weekAhead }: { weekAhead: WeekAhead }) {
  if (!weekAhead.hasActiveProgramme) {
    return <NoActiveProgramme />;
  }

  return (
    <main className="w-full pb-14">
      <header className="mb-6">
        <h1 className="text-fluid-sm font-black leading-snug tracking-tight text-foreground">
          The week ahead
        </h1>
        <p className="mt-2 text-base text-muted">
          {weekAhead.days.length > 0
            ? "What is coming up next, so you can plan camera days and publish slots before they arrive."
            : "You have reached the end of your programme."}
        </p>
      </header>

      {weekAhead.days.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {weekAhead.days.map((day) => (
            <li key={day.dayNumber}>
              <UpcomingDayRow day={day} />
            </li>
          ))}
        </ol>
      ) : (
        <EndOfProgramme />
      )}

      {weekAhead.days.length > 0 && weekAhead.reachesProgrammeEnd ? (
        <p className="mt-6 rounded-2xl bg-surface px-5 py-4 text-sm text-muted">
          Day {weekAhead.durationDays} is the last day of this programme - the
          week ahead ends here.
        </p>
      ) : null}
    </main>
  );
}

function UpcomingDayRow({ day }: { day: UpcomingTaskDay }) {
  const dayType = day.dayType ? DAY_TYPE_LABELS[day.dayType] : null;

  return (
    <Link
      className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5"
      href={`/week-ahead/${day.dayNumber}`}
    >
      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-background">
        <span className="text-[10px] font-semibold uppercase text-muted">
          Day
        </span>
        <span className="text-base font-black leading-none text-foreground">
          {day.dayNumber}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-foreground">
          {day.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {dayType ? (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-2xs font-extrabold uppercase",
                day.dayType === "push" && "bg-accent/12 text-accent",
                day.dayType === "protect" && "bg-success/15 text-success",
                day.dayType === "recharge" && "bg-control text-muted",
              )}
            >
              {dayType}
            </span>
          ) : null}
          {day.contentType ? (
            <span className="rounded-full bg-background px-3 py-1 text-2xs font-bold capitalize text-muted">
              {day.contentType}
            </span>
          ) : null}
          {day.cameraRequired ? (
            <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-2xs font-bold text-muted">
              <Camera aria-hidden className="size-3.5" />
              Camera needed
            </span>
          ) : null}
          {typeof day.timeEstimateMinutes === "number" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-2xs font-bold text-muted">
              <Clock aria-hidden className="size-3.5" />
              About {day.timeEstimateMinutes} min
            </span>
          ) : null}
        </span>
      </span>

      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

function EndOfProgramme() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface px-6 py-10">
      <p className="text-xl font-extrabold tracking-tight text-foreground">
        No upcoming days left
      </p>
      <p className="max-w-[52ch] text-base text-muted">
        You have reached the last day of this programme. Finish today&apos;s task
        and your programme wraps up.
      </p>
      <Button asChild className="mt-2" size="sm">
        <Link href="/dashboard">Back to today</Link>
      </Button>
    </div>
  );
}

function NoActiveProgramme() {
  return (
    <main className="w-full pb-14">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface px-6 py-10">
        <p className="text-xl font-extrabold tracking-tight text-foreground">
          No programme running
        </p>
        <p className="max-w-[52ch] text-base text-muted">
          Start a programme and the days ahead of you will show up here.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button asChild size="sm">
            <Link href="/programs/available">Browse programmes</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
