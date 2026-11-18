import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { ProgramsView } from "@/components/programs/programs-view";
import { deriveChallengeProgress } from "@/lib/challenge-progress";
import { getDashboardRenderTime } from "@/lib/dashboard-render-time";
import { parseProgramsTab } from "@/lib/programs";
import { getCurrentProgrammeServer } from "@/lib/server-current-programme";
import { getEligibleProgrammesServer } from "@/lib/server-eligible-programmes";
import {
  getProgrammeTaskProgressServer,
  getProgrammeTasksServer,
} from "@/lib/server-programme-tasks";
import { getUserAchievementsServer } from "@/lib/server-achievements";
import { loadStageContext } from "@/lib/stage-gate";

export default function ProgramsPage({
  searchParams,
}: PageProps<"/programs">) {
  return (
    <RetryBoundary description="We couldn't load your program. Please try again.">
      <Suspense fallback={<PageSkeleton />}>
        <ProgramsContent searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function ProgramsContent({
  searchParams,
}: {
  searchParams: PageProps<"/programs">["searchParams"];
}) {
  // All independent - the api resolves the enrolment itself for tasks - so
  // they go together rather than in serial round trips. The eligible list only
  // feeds the "All Programmes" tab, so its failure is contained to that tab.
  const [{ profile, setup }, current, tasks, taskProgress, programmes, achievements, params] =
    await Promise.all([
      loadStageContext(),
      getCurrentProgrammeServer(),
      getProgrammeTasksServer(),
      getProgrammeTaskProgressServer(),
      getEligibleProgrammesServer().catch(() => null),
      getUserAchievementsServer(),
      searchParams as Promise<Record<string, string | string[] | undefined>>,
    ]);

  if (!current) {
    // Nothing assigned yet: the questionnaire comes first. Otherwise the
    // catalogue is the page, as the "All Programmes" tab.
    if (!setup?.setupCompleted) {
      redirect("/challenge-setup");
    }

    return (
      <ProgramsView
        initialTab="programmes"
        programme={null}
        programmes={programmes}
      />
    );
  }

  const progress = deriveChallengeProgress({
    day1ScheduledFor: current.day1ScheduledFor,
    durationDays: current.durationDays,
    timezone: profile.stage1.timezone,
    now: await getDashboardRenderTime(),
  });

  if (!progress) {
    redirect("/challenge-setup");
  }

  return (
    <ProgramsView
      initialTab={parseProgramsTab(params.tab)}
      programme={current.programme}
      programmes={programmes}
      progress={progress}
      achievements={achievements}
      taskProgress={taskProgress}
      tasks={tasks}
    />
  );
}
