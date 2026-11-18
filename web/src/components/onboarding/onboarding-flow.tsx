"use client";

import { ArrowRight, ChevronLeft } from "lucide-react";
import { QuestionnaireProgressHeader } from "@/components/onboarding/questionnaire-progress-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOnboardingFlow } from "@/hooks/onboarding/use-onboarding-flow";
import {
  biggestChallengeOptions,
  experienceLevelOptions,
  mainGoalOptions,
  postingFrequencyOptions,
  userTypeOptions,
  type ProfileResponse,
} from "@/schemas/onboarding.schema";
import { NameStep } from "./name-step";
import { PlatformsStep } from "./platforms-step";
import { RegionStep } from "./region-step";
import { SingleSelectStep } from "./single-select-step";
import { TimezoneStep } from "./timezone-step";
import { WelcomeVideo } from "./welcome-video";

interface OnboardingFlowProps {
  email: string;
  initialStage1: ProfileResponse["stage1"];
}

export function OnboardingFlow({ email, initialStage1 }: OnboardingFlowProps) {
  const flow = useOnboardingFlow(initialStage1, email);

  return (
    <>
      <div
        aria-hidden={flow.isWelcomeVideoOpen || undefined}
        className="mx-auto flex min-h-screen w-full max-w-[840px] flex-col justify-center px-6 py-16"
        inert={flow.isWelcomeVideoOpen || undefined}
      >
        <QuestionnaireProgressHeader
          stepIndex={flow.stepIndex}
          totalSteps={flow.totalSteps}
        />

        <div className="auth-screen-enter" key={flow.stepIndex}>
          {renderStep(flow)}
        </div>

        {flow.submitError ? (
          <p className="mb-4 text-sm text-destructive">{flow.submitError}</p>
        ) : null}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!flow.isFirstStep ? (
              <button
                className="flex size-9 items-center justify-center rounded-full border border-foreground bg-background transition-colors hover:bg-surface"
                onClick={flow.back}
                type="button"
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : null}
          </div>

          <Button
            disabled={!flow.canContinue || flow.isSubmitting}
            onClick={() => void flow.continueFlow()}
          >
            {flow.isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            <span>{flow.isLastStep ? "Finish" : "Continue"}</span>
            {!flow.isSubmitting ? <ArrowRight className="size-4" /> : null}
          </Button>
        </div>
      </div>

      {flow.isWelcomeVideoOpen ? (
        <WelcomeVideo
          name={flow.answers.name?.trim() ?? ""}
          onContinue={flow.continueAfterWelcome}
        />
      ) : null}
    </>
  );
}

function renderStep(flow: ReturnType<typeof useOnboardingFlow>) {
  switch (flow.field) {
    case "name":
      return (
        <NameStep
          onChange={(value) => flow.setAnswer("name", value)}
          value={flow.answers.name ?? ""}
        />
      );
    case "userType":
      return (
        <SingleSelectStep
          accent="describes"
          heading="Which best describes you?"
          onChange={(value) => flow.setAnswer("userType", value)}
          options={userTypeOptions}
          value={flow.answers.userType}
        />
      );
    case "region":
      return (
        <RegionStep
          onChange={(value) => flow.setAnswer("region", value)}
          value={flow.answers.region}
        />
      );
    case "timezone":
      return (
        <TimezoneStep
          onChange={(value) => flow.setAnswer("timezone", value)}
          value={flow.answers.timezone}
        />
      );
    case "platforms":
      return (
        <PlatformsStep
          onChange={(value) => flow.setAnswer("platforms", value)}
          value={flow.answers.platforms}
        />
      );
    case "experienceLevel":
      return (
        <SingleSelectStep
          accent="content creation"
          heading="How experienced are you with content creation?"
          onChange={(value) => flow.setAnswer("experienceLevel", value)}
          options={experienceLevelOptions}
          value={flow.answers.experienceLevel}
        />
      );
    case "postingFrequency":
      return (
        <SingleSelectStep
          accent="often"
          heading="How often do you currently post?"
          onChange={(value) => flow.setAnswer("postingFrequency", value)}
          options={postingFrequencyOptions}
          value={flow.answers.postingFrequency}
        />
      );
    case "mainGoal":
      return (
        <SingleSelectStep
          accent="goal"
          heading="What's your biggest goal right now?"
          onChange={(value) => flow.setAnswer("mainGoal", value)}
          options={mainGoalOptions}
          value={flow.answers.mainGoal}
        />
      );
    case "biggestChallenge":
      return (
        <SingleSelectStep
          accent="challenge"
          heading="What's your biggest challenge?"
          onChange={(value) => flow.setAnswer("biggestChallenge", value)}
          options={biggestChallengeOptions}
          value={flow.answers.biggestChallenge}
        />
      );
    default:
      return null;
  }
}
