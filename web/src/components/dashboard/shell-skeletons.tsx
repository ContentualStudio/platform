/**
 * Placeholders rendered into the prerendered shell while request-time chrome
 * streams in. They mirror the real layout's dimensions so nothing shifts once
 * the profile-dependent UI arrives.
 */

export function SidebarSkeleton() {
  return (
    <aside
      aria-hidden
      data-skeleton
      className="hidden w-60 shrink-0 flex-col bg-surface px-6 py-9 min-[921px]:flex"
    >
      <div className="mb-12 size-12 rounded-full bg-foreground/10" />
      <div className="flex flex-1 flex-col gap-5">
        {["home", "challenge", "community", "analytics", "research", "studio"].map(
          (item) => (
            <div className="h-9 rounded-lg bg-foreground/5" key={item} />
          ),
        )}
      </div>
    </aside>
  );
}

export function HeaderSkeleton() {
  return (
    <div aria-hidden data-skeleton className="mb-8 flex items-center justify-between">
      <div className="h-9 w-64 rounded-lg bg-foreground/5" />
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-foreground/5" />
        <div className="size-10 rounded-full bg-foreground/5" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-hidden data-skeleton className="w-full space-y-6">
      <div className="h-[280px] rounded-2xl bg-foreground/5" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {["one", "two", "three"].map((item) => (
          <div className="h-[220px] rounded-2xl bg-foreground/5" key={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * The daily cockpit's own fallback. `PageSkeleton` is the generic one shared
 * by every protected page; this one mirrors the dashboard — calendar strip,
 * task card, check-in card — so the skeleton card sits where today's task
 * lands and the layout does not shift when it resolves.
 */
export function DashboardSkeleton() {
  return (
    <div aria-hidden data-skeleton className="w-full pb-14">
      <div className="flex flex-col gap-5.5">
        <div className="min-h-46 rounded-2xl bg-foreground/5" />
        <div className="grid grid-cols-1 items-center gap-4.5 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="h-27 rounded-2xl bg-foreground/5" />
          <div className="grid grid-cols-3 gap-2">
            {["day", "streak", "progress"].map((item) => (
              <div className="h-19 min-w-28 rounded-xl bg-foreground/5" key={item} />
            ))}
          </div>
        </div>
        <div className="grid items-start gap-5.5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="flex flex-col gap-5.5">
            <TaskCardSkeleton />
            <div className="min-h-31.5 rounded-2xl bg-foreground/5" />
          </div>
          <div className="flex flex-col gap-5.5">
            <div className="min-h-115 rounded-2xl bg-foreground/5" />
            <div className="min-h-31.5 rounded-2xl bg-foreground/5" />
          </div>
        </div>
        <div className="h-22 rounded-xl bg-foreground/5" />
      </div>
    </div>
  );
}

/** The card itself, sized to the real one so today's task drops straight in. */
function TaskCardSkeleton() {
  return (
    <div className="min-h-115 rounded-2xl bg-surface p-7.5">
      <div className="mb-4 h-3 w-28 rounded-full bg-foreground/5" />
      <div className="mb-3 h-8 w-3/4 rounded-lg bg-foreground/5" />
      <div className="mb-6 h-4 w-full rounded-lg bg-foreground/5" />
      <div className="mb-6 flex gap-2">
        {["type", "slot", "post"].map((item) => (
          <div className="h-7 w-24 rounded-full bg-foreground/5" key={item} />
        ))}
      </div>
      <div className="mb-6 grid grid-cols-1 gap-2.25 sm:grid-cols-2">
        {["one", "two", "three", "four"].map((item) => (
          <div className="h-12 rounded-xl bg-foreground/5" key={item} />
        ))}
      </div>
      <div className="h-11.5 w-44 rounded-full bg-foreground/5" />
    </div>
  );
}

/** A Studio lesson card: thumbnail block, title and meta lines. Dimensions use
 * the nearest design tokens (the real card's 26px radius and 18px rhythm have
 * no token); the grid structure matches exactly so nothing shifts on resolve.
 */
function StudioLessonCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <div className="aspect-video w-full bg-foreground/5" />
      <div className="p-5">
        <div className="mb-2 h-6 w-3/4 rounded-lg bg-foreground/5" />
        <div className="mb-2 h-4 w-full rounded-lg bg-foreground/5" />
        <div className="mb-4.5 flex gap-1.5">
          <div className="h-7 w-24 rounded-full bg-foreground/5" />
          <div className="h-7 w-20 rounded-full bg-foreground/5" />
        </div>
        <div className="flex justify-between gap-3 pt-4.5">
          <div className="h-4 w-20 rounded-lg bg-foreground/5" />
          <div className="h-4 w-16 rounded-lg bg-foreground/5" />
        </div>
      </div>
    </div>
  );
}

/** Studio home: header, programme banner and the For-you grid. */
export function StudioHomeSkeleton() {
  return (
    <div aria-hidden data-skeleton className="mx-auto w-full max-w-6xl pb-24">
      <div className="mb-9.5 flex flex-wrap items-end justify-between gap-7">
        <div>
          <div className="mb-2.5 h-3 w-40 rounded-full bg-foreground/5" />
          <div className="h-11 w-48 rounded-lg bg-foreground/5" />
          <div className="mt-3 h-4 w-full max-w-[660px] rounded-lg bg-foreground/5" />
        </div>
        <div className="h-10.5 w-44 rounded-full bg-foreground/5" />
      </div>
      <div className="mb-10.5 h-55 rounded-2xl bg-foreground/5" />
      <div className="mt-10">
        <div className="mb-5">
          <div className="mb-2 h-8 w-40 rounded-lg bg-foreground/5" />
          <div className="h-4 w-72 rounded-lg bg-foreground/5" />
        </div>
        <div className="grid gap-5.5 min-[900px]:grid-cols-3">
          {["one", "two", "three"].map((item) => (
            <StudioLessonCardSkeleton key={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Studio browse: header, filter bar, search and the library grid. */
export function StudioBrowseSkeleton() {
  return (
    <div aria-hidden data-skeleton className="mx-auto w-full max-w-6xl pb-24">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 h-3 w-28 rounded-full bg-foreground/5" />
          <div className="h-10 w-64 rounded-lg bg-foreground/5" />
          <div className="mt-2 h-4 w-80 rounded-lg bg-foreground/5" />
        </div>
        <div className="h-4 w-16 rounded-lg bg-foreground/5" />
      </div>
      <div className="mb-7 grid gap-3 rounded-xl bg-surface p-4.5 min-[980px]:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        {["format", "level", "platform", "topic"].map((item) => (
          <div className="h-11 rounded-xl bg-foreground/5" key={item} />
        ))}
        <div className="h-11 w-28 rounded-xl bg-foreground/5" />
      </div>
      <div className="relative mb-5 max-w-xl">
        <div className="h-11 w-full rounded-xl bg-foreground/5" />
      </div>
      <div className="grid gap-5.5 min-[900px]:grid-cols-3">
        {["one", "two", "three", "four", "five", "six"].map((item) => (
          <StudioLessonCardSkeleton key={item} />
        ))}
      </div>
    </div>
  );
}

/** The eligible-programmes list: a header and a grid of programme cards. */
export function EligibleProgrammesSkeleton() {
  return (
    <div aria-hidden data-skeleton className="w-full pb-14">
      <div className="mb-6">
        <div className="mb-2 h-3 w-28 rounded-full bg-foreground/5" />
        <div className="mb-3 h-8 w-64 rounded-lg bg-foreground/5" />
        <div className="h-4 w-full max-w-xl rounded-lg bg-foreground/5" />
      </div>
      <div className="grid grid-cols-1 gap-5.5 md:grid-cols-2 xl:grid-cols-3">
        {["one", "two", "three"].map((item) => (
          <div className="min-h-64 rounded-2xl bg-surface p-6" key={item}>
            <div className="mb-3 flex gap-2">
              <div className="h-7 w-20 rounded-full bg-foreground/5" />
              <div className="h-7 w-24 rounded-full bg-foreground/5" />
            </div>
            <div className="mb-3 h-6 w-3/4 rounded-lg bg-foreground/5" />
            <div className="mb-2 h-4 w-full rounded-lg bg-foreground/5" />
            <div className="h-4 w-2/3 rounded-lg bg-foreground/5" />
            <div className="mt-8 h-11.5 w-full rounded-full bg-foreground/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgrammeHistorySkeleton() {
  return (
    <div aria-hidden data-skeleton className="w-full pb-14">
      <div className="mb-7 h-3 w-14 rounded-full bg-foreground/5" />
      <div className="mb-3 h-4 w-28 rounded-full bg-foreground/5" />
      <div className="mb-3 h-8 w-64 rounded-lg bg-foreground/5" />
      <div className="h-4 w-full max-w-xl rounded-lg bg-foreground/5" />
      <div className="mt-6 flex flex-wrap gap-2">
        {["one", "two", "three"].map((item) => (
          <div className="h-15 w-37.5 rounded-xl bg-foreground/5" key={item} />
        ))}
      </div>
      <div className="mt-4 mb-5 h-11 border-b border-border" />
      <div className="flex flex-col gap-3">
        {["one", "two", "three"].map((item) => (
          <div className="h-26 rounded-2xl bg-foreground/5" key={item} />
        ))}
      </div>
    </div>
  );
}

/** The analytics growth graph's card: heading row, window selector, chart. */
export function GrowthGraphSkeleton() {
  return (
    <div aria-hidden data-skeleton className="mb-16 rounded-3xl bg-surface p-7">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="h-6 w-40 rounded-lg bg-foreground/5" />
        <div className="h-10 w-48 rounded-full bg-foreground/5" />
      </div>
      <div className="h-65 w-full animate-pulse rounded-4xl bg-foreground/5" />
    </div>
  );
}

/** The analytics posts section: heading, tabs, and a few table rows. */
export function AnalyticsPostsSkeleton() {
  return (
    <div aria-hidden data-skeleton className="mb-12">
      <div className="mb-6 h-12 w-64 rounded-lg bg-foreground/5" />
      <div className="mb-6 h-10 w-72 rounded-lg bg-foreground/5" />
      <div className="space-y-3 rounded-3xl bg-surface p-4">
        {["one", "two", "three"].map((row) => (
          <div className="flex items-center gap-3" key={row}>
            <div className="size-11 flex-shrink-0 rounded-md bg-foreground/5 md:size-12" />
            <div className="h-4 flex-1 animate-pulse rounded-lg bg-foreground/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
