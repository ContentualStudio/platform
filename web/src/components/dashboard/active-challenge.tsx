import Link from "next/link";
import { Flame } from "lucide-react";
import { DashboardAnalyticsSnapshot } from "@/components/dashboard/analytics-snapshot";
import { ChallengeCalendar } from "@/components/dashboard/challenge-calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChallengeProgress } from "@/lib/challenge-progress";

interface ActiveChallengeProps {
  programmeTitle: string;
  programmeDescription: string;
  progress: ChallengeProgress;
  /** Day 1's local date, for the window between "Begin" and Day 1 arriving. */
  startsOnLabel: string;
}

// The export's card button is black in light and accent in dark, which no
// existing Button variant covers.
const cardButtonClass =
  "min-w-40 bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground";

export function ActiveChallenge({
  programmeTitle,
  programmeDescription,
  progress,
  startsOnLabel,
}: ActiveChallengeProps) {
  const dayNumber = String(progress.currentDay).padStart(2, "0");
  const totalDays = String(progress.totalDays).padStart(2, "0");

  return (
    <main className="w-full">
      <ChallengeCalendar days={progress.days} />

      <SectionHeading
        subtitle="Your current challenges and tasks:"
        title="See Your Active Challenge"
      />

      <div className="mb-16 grid grid-cols-1 gap-16 md:grid-cols-2">
        <Card>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
            {programmeTitle}
          </p>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-5xl font-black leading-none tracking-tight text-foreground">
              {progress.hasStarted ? (
                <>
                  Day {dayNumber}
                  <span className="text-muted">/{totalDays}</span>
                </>
              ) : (
                "Starting soon"
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className={cardButtonClass} size="sm">
                <Link href="/programs?tab=tasks">View Daily Tasks</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/week-ahead">Week Ahead</Link>
              </Button>
            </div>
          </div>
          <p className="text-base text-muted">
            {progress.hasStarted
              ? programmeDescription
              : `Your first task unlocks on ${startsOnLabel}.`}
          </p>
        </Card>

        <DashboardAnalyticsSnapshot variant="challenge" />
      </div>

      <SectionHeading
        subtitle="View your top performance and improvements:"
        title="See Your Progress"
      />

      <div className="mb-16 grid grid-cols-1 gap-16 md:grid-cols-2">
        <Card className="flex flex-col items-start justify-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-5xl font-black leading-none text-foreground">
              {progress.hasStarted ? progress.currentDay : 0}
            </span>
            <Flame aria-hidden className="size-9 text-accent" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm text-muted">
              {progress.hasStarted
                ? "Congrats! You're on a roll!"
                : "You're All Set!"}
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {progress.hasStarted
                ? "Challenges Completion Streak"
                : `Day 1 opens on ${startsOnLabel}.`}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-2">
          <ProgressRing percent={progress.progressPercent} />
          <div>
            <p className="mb-2 text-sm text-muted">You&apos;re Making Progress!</p>
            <p className="text-2xl font-semibold text-foreground">
              Current Challenge Completion
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}

// The export draws its ring with a rotated border, which can only ever show a
// quarter arc — an SVG track/arc pair keeps the same 100px/6px geometry while
// actually reflecting the percentage.
function ProgressRing({ percent }: { percent: number }) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      aria-label={`${percent}% complete`}
      className="size-[100px] shrink-0 -rotate-90"
      role="img"
      viewBox="0 0 100 100"
    >
      <circle
        className="stroke-control"
        cx="50"
        cy="50"
        fill="none"
        r={radius}
        strokeWidth="6"
      />
      <circle
        className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-contentual"
        cx="50"
        cy="50"
        fill="none"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        strokeLinecap="round"
        strokeWidth="6"
      />
      <text
        className="rotate-90 fill-foreground text-2xl font-extrabold"
        dominantBaseline="central"
        textAnchor="middle"
        // Rotating the ring to start at 12 o'clock would take the label with
        // it, so the label spins back about the same center.
        style={{ transformOrigin: "50px 50px" }}
        x="50"
        y="50"
      >
        {percent}%
      </text>
    </svg>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <h2 className="mb-1 text-4xl font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mb-6 text-base text-muted">{subtitle}</p>
    </>
  );
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-3xl bg-surface px-8 py-15", className)}>
      {children}
    </div>
  );
}
