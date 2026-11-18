"use client";

import { ArrowRight, ChevronLeft } from "lucide-react";
import { QuestionnaireProgressHeader } from "@/components/onboarding/questionnaire-progress-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SingleSelectStep } from "@/components/onboarding/single-select-step";
import { useChallengeSetupFlow } from "@/hooks/challenge-setup/use-challenge-setup-flow";
import { resolvePrimaryPlatformForSelection } from "@/hooks/challenge-setup/stage2-hydration";
import { cn } from "@/lib/utils";
import {
  contentTypeOptions,
  followerRangeOptions,
  nicheOptions,
  platformOptions,
  postingGoalOptions,
  type ChallengeSetupStatus,
} from "@/schemas/challenge-setup.schema";
import { ConnectInstagramStep } from "./connect-instagram-step";
import { MilestoneStep } from "./milestone-step";
import { MultiSelectStep } from "./multi-select-step";
import { NumberStepperStep } from "./number-stepper-step";
import { TestimonialStep } from "./testimonial-step";
import { WeekdayStep } from "./weekday-step";

interface ChallengeSetupFlowProps {
  initialStatus: ChallengeSetupStatus;
  onComplete: (status: ChallengeSetupStatus) => void;
}

export function ChallengeSetupFlow({
  initialStatus,
  onComplete,
}: ChallengeSetupFlowProps) {
  const flow = useChallengeSetupFlow({ initialStatus, onComplete });

  // The Connect Instagram step drives its own advance (Connect / Skip) rather
  // than the shared Continue button.
  const isConnectStep = flow.field === "instagramConnected";
  // The testimonial interstitial drops the step chrome entirely — no label,
  // no progress bar, no back button — and centers a single accent CTA.
  const isTestimonialStep = flow.field === "sawTestimonial";

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[840px] flex-col px-6 pb-16",
        isTestimonialStep
          ? "items-center justify-center pt-10 text-center md:pt-16"
          : "justify-start pt-16 md:pt-20",
      )}
    >
      {isTestimonialStep ? (
        <QuestionnaireProgressHeader
          className="z-2"
          mascotLayout="inline"
          showProgress={false}
          showStepLabel={false}
          stepIndex={flow.stepIndex}
          totalSteps={flow.totalSteps}
        />
      ) : (
        <QuestionnaireProgressHeader
          stepIndex={flow.stepIndex}
          totalSteps={flow.totalSteps}
        />
      )}

      <div
        className={cn(
          "w-full",
          isTestimonialStep ? "auth-screen-fade relative z-1" : "auth-screen-enter",
        )}
        key={flow.stepIndex}
      >
        {renderStep(flow)}
      </div>

      {flow.submitError ? (
        <p className="relative z-1 mb-4 text-sm text-destructive">{flow.submitError}</p>
      ) : null}

      {!isConnectStep ? (
        isTestimonialStep ? (
          <div className="relative z-1 mt-8 flex justify-center md:mt-14">
            <Button
              className="min-w-[170px]"
              disabled={!flow.canContinue || flow.isSubmitting}
              onClick={() => void flow.continueFlow()}
            >
              {flow.isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              <span>Next</span>
              {!flow.isSubmitting ? <ArrowRight className="size-4" /> : null}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                aria-label={
                  flow.isFirstStep ? "Back to dashboard" : "Previous question"
                }
                className="flex size-9 items-center justify-center rounded-full border border-foreground bg-background transition-colors hover:bg-surface"
                disabled={flow.isSubmitting}
                onClick={() => void flow.back()}
                type="button"
              >
                <ChevronLeft className="size-5" />
              </button>
            </div>

            <Button
              disabled={!flow.canContinue || flow.isSubmitting}
              onClick={() => void flow.continueFlow()}
            >
              {flow.isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              <span>{flow.isLastStep ? "Finish & Match Me" : "Continue"}</span>
              {!flow.isSubmitting ? <ArrowRight className="size-4" /> : null}
            </Button>
          </div>
        )
      ) : null}
      {!flow.canContinue && !isConnectStep && !isTestimonialStep ? (
        <p className="mt-3 text-right text-sm text-destructive" role="alert">
          {flow.fieldError}
        </p>
      ) : null}
    </div>
  );
}

function renderStep(flow: ReturnType<typeof useChallengeSetupFlow>) {
  switch (flow.field) {
    case "platforms":
      return (
        <MultiSelectStep
          accent="platform(s)"
          heading="Which platform(s) do you focus on?"
          onChange={(value) => {
            flow.setAnswer("platforms", value);
            flow.setAnswer(
              "primaryPlatform",
              resolvePrimaryPlatformForSelection(
                value,
                flow.answers.primaryPlatform,
              ),
            );
          }}
          options={platformOptions}
          value={flow.answers.platforms}
        />
      );
    case "postingGoal":
      return (
        <SingleSelectStep
          accent="often"
          heading="How often do you want to post?"
          onChange={(value) => flow.setAnswer("postingGoal", value)}
          options={postingGoalOptions}
          value={flow.answers.postingGoal}
        />
      );
    case "weeklyCommitment":
      return (
        <NumberStepperStep
          accent="commit"
          heading="How many days per week can you realistically commit?"
          onChange={(value) => {
            flow.setAnswer("weeklyCommitment", value);
            const days = flow.answers.availableDays;
            if (days && days.length > value) {
              flow.setAnswer("availableDays", days.slice(0, value));
            }
          }}
          value={flow.answers.weeklyCommitment}
        />
      );
    case "availableDays":
      return (
        <WeekdayStep
          heading="Which days of the week are you able to create on?"
          maxSelection={flow.answers.weeklyCommitment}
          onChange={(value) => flow.setAnswer("availableDays", value)}
          value={flow.answers.availableDays}
        />
      );
    case "sawTestimonial":
      return <TestimonialStep />;
    case "nicheDefined":
      return (
        <SingleSelectStep
          accent="niche"
          heading="Have you defined your niche?"
          onChange={(value) => flow.setAnswer("nicheDefined", value)}
          options={nicheOptions}
          value={flow.answers.nicheDefined}
        />
      );
    case "contentType":
      return (
        <SingleSelectStep
          accent="content type"
          heading="What's your primary content type?"
          onChange={(value) => flow.setAnswer("contentType", value)}
          options={contentTypeOptions}
          value={flow.answers.contentType}
        />
      );
    case "followerRange":
      return (
        <SingleSelectStep
          accent="followers"
          heading="Approximately how many followers do you have?"
          onChange={(value) => flow.setAnswer("followerRange", value)}
          options={followerRangeOptions}
          value={flow.answers.followerRange}
        />
      );
    case "instagramConnected":
      return (
        // The step leaves for Instagram and reports back on return, so the
        // recorded answer follows a real connection rather than the user's
        // word for it.
        <ConnectInstagramStep
          onConnected={() => {
            flow.setAnswer("instagramConnected", true);
            void flow.continueFlow({ instagramConnected: true });
          }}
          onSkip={() => {
            flow.setAnswer("instagramConnected", false);
            void flow.continueFlow({ instagramConnected: false });
          }}
          value={flow.answers.instagramConnected}
        />
      );
    case "milestone":
      return (
        <MilestoneStep
          onChange={(value) => flow.setAnswer("milestone", value)}
          value={flow.answers.milestone ?? ""}
        />
      );
    default:
      return null;
  }
}
