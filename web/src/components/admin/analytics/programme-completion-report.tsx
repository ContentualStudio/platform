import { ChartNoAxesColumn } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { ProgressBar } from "@/components/admin/progress-bar";
import {
  getProgrammeCompletion,
  type ProgrammeCompletionRow,
} from "@/lib/admin/admin-analytics";

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/**
 * The headline, in words a newcomer reads without a legend: how many
 * creators are on a programme, have finished one, or left one — then a single
 * sentence for the rates. Counts are each user's latest journey per programme.
 *
 * A dark island in both themes (data-theme="dark" re-resolves every --ds-*
 * token inside it), the same voice as the admin sign-in.
 */
export async function ProgrammeCompletionOverview() {
  const { summary } = await getProgrammeCompletion();

  if (summary.participants === 0) {
    return <NoParticipants />;
  }

  return (
    <section
      aria-label="Overview"
      className="relative overflow-hidden rounded-lg border border-border bg-background px-6 py-8 text-foreground md:px-10"
      data-theme="dark"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-accent/15 blur-3xl"
      />

      <dl className="relative grid grid-cols-3 gap-6">
        <Figure label="Active now" value={summary.active} />
        <Figure label="Finished" value={summary.completed} />
        <Figure label="Dropped off" value={summary.droppedOff} />
      </dl>

      <p className="relative mt-8 max-w-2xl border-t border-border pt-6 text-base text-muted-foreground">
        On average, creators get through{" "}
        <strong className="font-semibold text-foreground">
          {percent(summary.averageCompletion)}
        </strong>{" "}
        of a programme.{" "}
        {summary.completionRate === null ? (
          "No one has finished or left a programme yet."
        ) : (
          <>
            Of those who reached the end or left,{" "}
            <strong className="font-semibold text-foreground">
              {percent(summary.completionRate)}
            </strong>{" "}
            finished.
          </>
        )}
      </p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-5xl font-bold leading-none tracking-tight tabular-nums text-foreground">
        {value.toLocaleString("en-GB")}
      </dd>
    </div>
  );
}

/**
 * One row per programme people are on, with one bar that means one thing:
 * how far through the programme they get on average. Programmes nobody has
 * started are listed by name underneath rather than as rows of zeros.
 */
export async function ProgrammeCompletionList() {
  const { summary, programmes } = await getProgrammeCompletion();

  if (summary.participants === 0) {
    return null;
  }

  const running = programmes.filter((row) => row.participants > 0);
  const notStarted = programmes.filter((row) => row.participants === 0);

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="programmes"
        className="overflow-hidden rounded-lg border border-border bg-background"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground" id="programmes">
            Programmes
          </h2>
          <span className="hidden text-xs text-muted-foreground sm:block">Average progress</span>
        </div>
        <ul className="divide-y divide-border">
          {running.map((row) => (
            <ProgrammeRow key={row.slug} row={row} />
          ))}
        </ul>
      </section>

      {notStarted.length > 0 ? (
        <section aria-labelledby="not-started">
          <h2 className="mb-3 text-sm text-muted-foreground" id="not-started">
            Not started yet
          </h2>
          <ul className="flex flex-wrap gap-2">
            {notStarted.map((row) => (
              <li
                className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
                key={row.slug}
              >
                {row.title ?? row.slug}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ProgrammeRow({ row }: { row: ProgrammeCompletionRow }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-semibold text-foreground">
          {row.title ?? row.slug}
          {row.title ? null : (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(no longer published)</span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {row.active} active · {row.completed} finished · {row.droppedOff} dropped off
        </span>
      </div>

      <div className="shrink-0 sm:w-64">
        <ProgressBar label="Average progress" value={row.averageCompletion} />
      </div>
    </li>
  );
}

function NoParticipants() {
  return (
    <EmptyState
      bordered
      description="Once creators start a programme, you'll see how far they get here."
      icon={ChartNoAxesColumn}
      title="No one has started a programme yet"
    />
  );
}

export function OverviewSkeleton() {
  return (
    <div
      aria-hidden
      className="h-56 rounded-lg border border-border bg-background"
      data-skeleton
      data-theme="dark"
    />
  );
}

export function ListSkeleton() {
  return (
    <div aria-hidden className="h-40 rounded-lg border border-border bg-background" data-skeleton />
  );
}
