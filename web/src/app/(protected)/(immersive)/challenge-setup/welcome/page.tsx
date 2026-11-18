import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SetupSkeleton } from "@/components/challenge-setup/setup-skeleton";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { WelcomePage } from "@/components/programme/welcome-page";
import { greetingFirstName } from "@/lib/display-name";
import { loadStageContext } from "@/lib/stage-gate";

export default function ProgrammeWelcomePage() {
  return (
    <RetryBoundary description="We couldn't load your programme. Please try again.">
      <Suspense fallback={<SetupSkeleton />}>
        <ProgrammeWelcomeContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function ProgrammeWelcomeContent() {
  const { profile, setup } = await loadStageContext();

  // No assignment yet -> send them through the questionnaire first.
  if (!setup?.assignedProgramme) {
    redirect("/challenge-setup");
  }

  // One-time gate: once the programme has begun, revisiting forwards to the
  // dashboard — the gate never re-shows and the programme never re-starts.
  if (setup.programmeStarted) {
    redirect("/dashboard");
  }

  return (
    <WelcomePage
      name={greetingFirstName({
        email: profile.user.email,
        name: profile.stage1.name || profile.user.name,
      })}
    />
  );
}
