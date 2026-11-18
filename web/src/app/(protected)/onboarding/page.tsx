import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { SetupSkeleton } from "@/components/challenge-setup/setup-skeleton";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { getProfileServer } from "@/lib/server-profile";

export default function OnboardingPage() {
  return (
    <RetryBoundary description="We couldn't start onboarding. Please try again.">
      <Suspense fallback={<SetupSkeleton />}>
        <OnboardingContent />
      </Suspense>
    </RetryBoundary>
  );
}

async function OnboardingContent() {
  const profile = await getProfileServer();

  if (!profile) {
    redirect("/auth/sign");
  }

  if (profile.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <OnboardingFlow
      email={profile.user.email}
      initialStage1={profile.stage1}
    />
  );
}
