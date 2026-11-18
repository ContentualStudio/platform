import { Suspense } from "react";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { WeekAheadSkeleton } from "@/components/week-ahead/week-ahead-skeleton";
import { WeekAheadView } from "@/components/week-ahead/week-ahead-view";
import { getWeekAheadServer } from "@/lib/server-week-ahead";

export default function WeekAheadPage() {
  return (
    <RetryBoundary description="We couldn't load your upcoming tasks. Please try again.">
      <Suspense fallback={<WeekAheadSkeleton />}>
        <WeekAheadContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function WeekAheadContent() {
  // The API scopes the window to the caller's own active enrolment; the page
  // never passes a user id of its own.
  return <WeekAheadView weekAhead={await getWeekAheadServer()} />;
}
