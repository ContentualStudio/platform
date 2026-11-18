import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChallengeSetupExperience } from "@/components/challenge-setup/challenge-setup-experience";
import { SetupSkeleton } from "@/components/challenge-setup/setup-skeleton";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { emptyChallengeSetupStatus } from "@/schemas/challenge-setup.schema";
import { greetingFirstName } from "@/lib/display-name";
import { loadStageContext } from "@/lib/stage-gate";

export default function ChallengeSetupPage() {
  return (
    <RetryBoundary description="We couldn't load your saved answers. Please try again.">
      <Suspense fallback={<SetupSkeleton />}>
        <ChallengeSetupContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function ChallengeSetupContent() {
  const { profile, setup } = await loadStageContext();

  // Already begun -> the gate is closed; go straight to the dashboard.
  if (setup?.programmeStarted) {
    redirect("/dashboard");
  }

  // Questionnaire already finished (matched, not yet begun) -> jump to the
  // Welcome Page rather than re-asking the questions.
  if (setup?.setupCompleted) {
    redirect("/challenge-setup/welcome");
  }

  return (
    <ChallengeSetupExperience
      initialStatus={setup ?? emptyChallengeSetupStatus}
      name={greetingFirstName({
        email: profile.user.email,
        name: profile.stage1.name || profile.user.name,
      })}
    />
  );
}
