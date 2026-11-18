import { Suspense } from "react";
import { StudioHomeSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { StudioHome } from "@/components/studio/studio-home";
import { deriveChallengeProgress } from "@/lib/challenge-progress";
import { getDashboardRenderTime } from "@/lib/dashboard-render-time";
import { loadStudioRouteContext } from "@/lib/studio-route-context";

export default function StudioPage({ searchParams }: PageProps<"/studio">) {
  return (
    <RetryBoundary description="We couldn't load Studio. Please try again.">
      <Suspense fallback={<StudioHomeSkeleton />}>
        <StudioContent searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function StudioContent({
  searchParams,
}: {
  searchParams: PageProps<"/studio">["searchParams"];
}) {
  const { current, initialLessonId, lessons, platformLabel, profile } =
    await loadStudioRouteContext(searchParams);

  const progress = current
    ? deriveChallengeProgress({
        day1ScheduledFor: current.day1ScheduledFor,
        durationDays: current.durationDays,
        timezone: profile.stage1.timezone,
        now: await getDashboardRenderTime(),
      })
    : null;

  return (
    <StudioHome
      currentDay={progress?.currentDay ?? 0}
      initialLessonId={initialLessonId}
      lessons={lessons}
      platformLabel={platformLabel}
      programmeId={current?.programmeSourceId ?? null}
      programmeTitle={current?.programme.title ?? null}
      progressPercent={progress?.progressPercent ?? 0}
      totalDays={progress?.totalDays ?? current?.durationDays ?? 0}
    />
  );
}
