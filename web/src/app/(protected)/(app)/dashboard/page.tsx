import { Suspense } from "react";
import { DailyCockpitDashboard } from "@/components/dashboard/daily-cockpit-dashboard";
import { DashboardArrivalFade } from "@/components/dashboard/dashboard-arrival-fade";
import { FirstProgrammeHome } from "@/components/dashboard/first-programme-home";
import { ProgrammeSuggestionCta } from "@/components/dashboard/programme-suggestion-cta";
import { DashboardSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { deriveChallengeProgress } from "@/lib/challenge-progress";
import { getDashboardRenderTime } from "@/lib/dashboard-render-time";
import { getEligibleProgrammesServer } from "@/lib/server-eligible-programmes";
import { getInstagramConnectionServer } from "@/lib/server-instagram-connection";
import { getProgrammeHistoryServer } from "@/lib/server-programme-history";
import { getCurrentProgrammeServer } from "@/lib/server-current-programme";
import { getProgrammeSuggestionServer } from "@/lib/server-programme-suggestion";
import {
  getProgrammeTaskProgressServer,
  getProgrammeTasksServer,
} from "@/lib/server-programme-tasks";
import { loadStageContext } from "@/lib/stage-gate";

// The page itself renders synchronously so it prerenders into the shell; the
// profile/setup read happens one level down, behind Suspense.
export default function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  return (
    <RetryBoundary
      description="We couldn't load your challenge. Please try again."
      title="Something went wrong"
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  // Started before the early return so the current-programme read overlaps
  // the profile fetch rather than queueing behind it — it is the dashboard's
  // critical path. The welcome-video branch below never awaits it.
  const currentProgramme = getCurrentProgrammeServer();
  const [{ profile }, params] = await Promise.all([
    loadStageContext(),
    searchParams as Promise<Record<string, string | string[] | undefined>>,
  ]);

  // The welcome video always hands a new user to the calm first-use dashboard.
  // Normal Home navigation drops the query and resumes data-driven rendering.
  if (params.view === "empty") {
    return (
      <>
        <FirstChallengePrompt />
        {params.arrival === "welcome" ? <DashboardArrivalFade /> : null}
      </>
    );
  }

  // The programme under way, not the one the questionnaire assigned. For a
  // first programme these are the same; from the second onward they diverge,
  // and a user who has finished one has no current programme at all.
  const current = await currentProgramme;
  const progress = current
    ? deriveChallengeProgress({
        day1ScheduledFor: current.day1ScheduledFor,
        durationDays: current.durationDays,
        timezone: profile.stage1.timezone,
        now: await getDashboardRenderTime(),
      })
    : null;

  // Home shows the running challenge once a programme is under way, and the
  // first-challenge prompt otherwise (mirrors showHome()/showDashboard() in the
  // design export).
  if (current && progress) {
    const [tasks, taskProgress] = await Promise.all([
      getProgrammeTasksServer(),
      getProgrammeTaskProgressServer(),
    ]);

    return (
      <>
        <ProgrammeSuggestionSlot />
        <DailyCockpitDashboard
          programmeDescription={current.programme.description}
          programmeTitle={current.programme.title}
          progress={progress}
          taskProgress={taskProgress}
          tasks={tasks}
          timezone={profile.stage1.timezone}
        />
      </>
    );
  }

  return (
    <>
      <ProgrammeSuggestionSlot />
      <FirstChallengePrompt />
    </>
  );
}

// Its own Suspense with no fallback: the dashboard renders without waiting on
// the suggestion, and the CTA appears once it resolves. The read never throws,
// so a failure simply leaves the slot empty.
function ProgrammeSuggestionSlot() {
  return (
    <Suspense fallback={null}>
      <ProgrammeSuggestion />
    </Suspense>
  );
}

async function ProgrammeSuggestion() {
  const suggestion = await getProgrammeSuggestionServer();

  return suggestion ? (
    <ProgrammeSuggestionCta key={suggestion.id} suggestion={suggestion} />
  ) : null;
}

// The no-programme home. Each read is optional: a failure falls back to the
// first-time wording, no tick, or no starter list rather than an error page.
async function FirstChallengePrompt() {
  const [history, programmes, instagram] = await Promise.all([
    getProgrammeHistoryServer().catch(() => null),
    getEligibleProgrammesServer().catch(() => []),
    getInstagramConnectionServer().catch(() => null),
  ]);
  const hasChosenBefore = history
    ? history.inProgress.length + history.past.length > 0
    : false;
  const starters = programmes
    .filter((programme) => !programme.locked && !programme.requiresUpgrade)
    .slice(0, 3);

  return (
    <FirstProgrammeHome
      accountsConnected={Boolean(instagram?.connected)}
      hasChosenBefore={hasChosenBefore}
      programmes={starters}
    />
  );
}
