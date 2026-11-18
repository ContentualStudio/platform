import { Suspense } from "react";
import { ProgrammeHistoryView } from "@/components/programs/programme-history-view";
import { ProgrammeHistorySkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { getProgrammeHistoryServer } from "@/lib/server-programme-history";
import { loadStageContext } from "@/lib/stage-gate";

export default function ProgrammeHistoryPage() {
  return (
    <RetryBoundary
      description="Something went wrong fetching your programmes. Please try again."
      title="We couldn't load your history"
    >
      <Suspense fallback={<ProgrammeHistorySkeleton />}>
        <ProgrammeHistoryContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function ProgrammeHistoryContent() {
  const [history, { profile }] = await Promise.all([
    getProgrammeHistoryServer(),
    loadStageContext(),
  ]);

  return (
    <ProgrammeHistoryView
      history={history}
      timezone={profile.stage1.timezone || null}
    />
  );
}
