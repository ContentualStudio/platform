"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  stage1AnswersSchema,
  type stage1SummarySchema,
} from "@/schemas/onboarding.schema";
import { OnboardingServiceError } from "@/services/onboarding.service";
import { isEmailDerivedName } from "@/lib/display-name";
import {
  stage1Steps,
  useOnboardingStore,
  type Stage1FieldName,
  type Stage1FormState,
} from "@/stores/onboarding-store";
import { useSaveStage1StepMutation } from "./use-onboarding-mutations";
import type { z, ZodType } from "zod";

// The DB value may be null (never answered) or stale against the current
// enum (an option that was renamed/removed since it was saved) — only
// hydrate the field when it still validates against today's schema.
function parseIfValid<T>(
  schema: ZodType<T>,
  raw: string | string[] | null,
): T | undefined {
  if (raw == null) {
    return undefined;
  }

  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Resume at the first unanswered step, but always land on name first until
 * the user has continued past it. Google (and email OTP) may already seed a
 * name — we autofill it, still show the step so they can correct it.
 */
function findResumeIndex(answers: Stage1FormState): number {
  const userTypeValid = stage1AnswersSchema.shape.userType.safeParse(
    answers.userType,
  ).success;

  if (!userTypeValid) {
    return 0;
  }

  const index = stage1Steps.findIndex(
    (field) => !stage1AnswersSchema.shape[field].safeParse(answers[field]).success,
  );

  return index === -1 ? stage1Steps.length - 1 : index;
}

export function useOnboardingFlow(
  initialStage1: z.infer<typeof stage1SummarySchema>,
  email: string,
) {
  const router = useRouter();
  const stepIndex = useOnboardingStore((state) => state.stepIndex);
  const answers = useOnboardingStore((state) => state.answers);
  const submitError = useOnboardingStore((state) => state.submitError);
  const goToStep = useOnboardingStore((state) => state.goToStep);
  const nextStep = useOnboardingStore((state) => state.next);
  const backStep = useOnboardingStore((state) => state.back);
  const setAnswer = useOnboardingStore((state) => state.setAnswer);
  const setSubmitError = useOnboardingStore((state) => state.setSubmitError);
  const hydrate = useOnboardingStore((state) => state.hydrate);
  const mutation = useSaveStage1StepMutation();
  // router.push() doesn't resolve when navigation actually completes, so
  // mutation.isPending alone would flip back to false (un-spinning the
  // button) the moment the save request finishes, even though the browser
  // is still fetching/rendering the dashboard. Stay "submitting" through
  // that gap too — it only ever resets by this component unmounting.
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [isWelcomeVideoOpen, setIsWelcomeVideoOpen] = React.useState(false);

  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) {
      return;
    }

    hydrated.current = true;
    const { shape } = stage1AnswersSchema;
    const seededName = initialStage1.name?.trim() || undefined;
    const hydratedAnswers: Stage1FormState = {
      // Google name autofills; email-local-part placeholders stay empty.
      // findResumeIndex still opens the name step first so they can edit.
      name:
        seededName && !isEmailDerivedName(seededName, email)
          ? seededName
          : undefined,
      userType: parseIfValid(shape.userType, initialStage1.userType),
      region: parseIfValid(shape.region, initialStage1.region),
      timezone: parseIfValid(shape.timezone, initialStage1.timezone),
      platforms: parseIfValid(shape.platforms, initialStage1.platforms),
      experienceLevel: parseIfValid(
        shape.experienceLevel,
        initialStage1.experienceLevel,
      ),
      postingFrequency: parseIfValid(
        shape.postingFrequency,
        initialStage1.postingFrequency,
      ),
      mainGoal: parseIfValid(shape.mainGoal, initialStage1.mainGoal),
      biggestChallenge: parseIfValid(
        shape.biggestChallenge,
        initialStage1.biggestChallenge,
      ),
    };

    hydrate(hydratedAnswers, findResumeIndex(hydratedAnswers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = stage1Steps[stepIndex];
  const isLastStep = stepIndex === stage1Steps.length - 1;
  const isFirstStep = stepIndex === 0;

  const isFieldValid = React.useCallback(
    (name: Stage1FieldName) => {
      const shape = stage1AnswersSchema.shape[name];
      return shape.safeParse(answers[name]).success;
    },
    [answers],
  );

  const canContinue = isFieldValid(field);

  // Saves just the current step's answer — progress survives an abandoned
  // session instead of only persisting on the final "Finish" click.
  const continueFlow = React.useCallback(async () => {
    if (!canContinue) {
      return;
    }

    try {
      const summary = await mutation.mutateAsync({ [field]: answers[field] });

      if (isLastStep || summary.onboardingCompleted) {
        setIsWelcomeVideoOpen(true);
        return;
      }

      nextStep();
    } catch (error) {
      setSubmitError(
        error instanceof OnboardingServiceError
          ? error.message
          : "Something went wrong saving your answer. Please try again.",
      );
    }
  }, [answers, canContinue, field, isLastStep, mutation, nextStep, setSubmitError]);

  const continueAfterWelcome = React.useCallback(() => {
    setIsNavigating(true);
    router.push("/dashboard?view=empty&arrival=welcome");
  }, [router]);

  return {
    answers,
    back: backStep,
    canContinue,
    continueFlow,
    continueAfterWelcome,
    field,
    goToStep,
    isFirstStep,
    isLastStep,
    isSubmitting: mutation.isPending || isNavigating,
    isWelcomeVideoOpen,
    setAnswer,
    stepIndex,
    submitError,
    totalSteps: stage1Steps.length,
  };
}
