import { Suspense } from "react";
import { EligibleProgrammesView } from "@/components/programs/eligible-programmes-view";
import { EligibleProgrammesSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { getEligibleProgrammesServer } from "@/lib/server-eligible-programmes";

export default function AvailableProgrammesPage() {
  return (
    <RetryBoundary
      description="We couldn't load the programmes available to you. Please try again."
      title="Something went wrong"
    >
      <Suspense fallback={<EligibleProgrammesSkeleton />}>
        <AvailableProgrammesContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function AvailableProgrammesContent() {
  const programmes = await getEligibleProgrammesServer();

  return <EligibleProgrammesView programmes={programmes} />;
}
