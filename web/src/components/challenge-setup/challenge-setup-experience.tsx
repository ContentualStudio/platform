"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ChallengeSetupStatus } from "@/schemas/challenge-setup.schema";
import { COMPLETION_LOADING_DURATION_MS } from "./flow-navigation";
import { ChallengeSetupIntro } from "./challenge-setup-intro";
import { ChallengeSetupFlow } from "./challenge-setup-flow";
import { LoadingScreen } from "./loading-screen";
import { RecommendationScreen } from "./recommendation-screen";

interface ChallengeSetupExperienceProps {
  initialStatus: ChallengeSetupStatus;
  name: string | null;
}

type Step =
  | { kind: "intro" }
  | { kind: "flow" }
  | { kind: "loading"; status: ChallengeSetupStatus }
  | { kind: "recommendation"; status: ChallengeSetupStatus };

export function ChallengeSetupExperience({
  initialStatus,
  name,
}: ChallengeSetupExperienceProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(() =>
    hasSavedAnswers(initialStatus) ? { kind: "flow" } : { kind: "intro" },
  );

  React.useEffect(() => {
    if (step.kind !== "loading") {
      return;
    }

    // No assigned programme would mean the matcher failed to return one,
    // which it's built never to do — fall back to the welcome route directly
    // rather than get stuck showing a recommendation with nothing to show.
    const timer = window.setTimeout(() => {
      if (step.status.assignedProgramme) {
        setStep({ kind: "recommendation", status: step.status });
      } else {
        router.replace("/challenge-setup/welcome");
      }
    }, COMPLETION_LOADING_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [step, router]);

  if (step.kind === "intro") {
    return (
      <ChallengeSetupIntro
        name={name}
        onBack={() => router.push("/dashboard")}
        onContinue={() => setStep({ kind: "flow" })}
      />
    );
  }

  if (step.kind === "loading") {
    return <LoadingScreen />;
  }

  if (step.kind === "recommendation" && step.status.assignedProgramme) {
    return (
      <RecommendationScreen
        onChooseAlternative={(slug) =>
          router.replace(`/programs/${encodeURIComponent(slug)}/welcome`)
        }
        onContinue={() => router.replace("/challenge-setup/welcome")}
        programme={step.status.assignedProgramme}
      />
    );
  }

  return (
    <ChallengeSetupFlow
      initialStatus={initialStatus}
      onComplete={(status) => setStep({ kind: "loading", status })}
    />
  );
}

function hasSavedAnswers(status: ChallengeSetupStatus) {
  return Object.values(status.answers).some((answer) => answer !== null);
}
