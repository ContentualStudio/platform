"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  stage2AnswersSchema,
  type ChallengeSetupStatus,
} from "@/schemas/challenge-setup.schema";
import { ChallengeSetupServiceError } from "@/services/challenge-setup.service";
import {
  stage2Steps,
  useChallengeSetupStore,
  type Stage2FieldName,
} from "@/stores/challenge-setup-store";
import { resolveStage2Back } from "@/components/challenge-setup/flow-navigation";
import {
  findResumeIndex,
  hydrateStage2Answers,
  buildFinalStage2SavePayload,
  isStage2FieldValid,
  resolvePrimaryPlatformForSelection,
  stage2StepPayload,
} from "./stage2-hydration";
import {
  useCompleteStage2Mutation,
  useSaveStage2StepMutation,
} from "./use-challenge-setup-mutations";

interface UseChallengeSetupFlowArgs {
  initialStatus: ChallengeSetupStatus;
  onComplete: (status: ChallengeSetupStatus) => void;
}

export function useChallengeSetupFlow({
  initialStatus,
  onComplete,
}: UseChallengeSetupFlowArgs) {
  const router = useRouter();
  const stepIndex = useChallengeSetupStore((state) => state.stepIndex);
  const answers = useChallengeSetupStore((state) => state.answers);
  const submitError = useChallengeSetupStore((state) => state.submitError);
  const goToStep = useChallengeSetupStore((state) => state.goToStep);
  const nextStep = useChallengeSetupStore((state) => state.next);
  const setAnswer = useChallengeSetupStore((state) => state.setAnswer);
  const setSubmitError = useChallengeSetupStore(
    (state) => state.setSubmitError,
  );
  const hydrate = useChallengeSetupStore((state) => state.hydrate);
  const saveMutation = useSaveStage2StepMutation();
  const completeMutation = useCompleteStage2Mutation();

  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) {
      return;
    }

    hydrated.current = true;
    const hydratedAnswers = hydrateStage2Answers(initialStatus.answers);

    hydrate(hydratedAnswers, findResumeIndex(hydratedAnswers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = stage2Steps[stepIndex];
  const isLastStep = stepIndex === stage2Steps.length - 1;
  const isFirstStep = stepIndex === 0;

  const isFieldValid = React.useCallback(
    (name: Stage2FieldName) => isStage2FieldValid(name, answers),
    [answers],
  );

  const canContinue = isFieldValid(field);

  // Saves just the current step's answer so progress survives an abandoned
  // session. Only the final action calls the completion/matching Server Action.
  // `override` lets a step that sets-then-advances in one tick
  // (Connect Instagram) pass its fresh value directly, sidestepping the stale
  // store closure.
  const continueFlow = React.useCallback(
    async (override?: Partial<Record<Stage2FieldName, unknown>>) => {
      const hasOverride = Boolean(override && field in override);
      if (!hasOverride && !canContinue) {
        return;
      }

      const value = hasOverride ? override![field] : answers[field];
      const payload = isLastStep
        ? buildFinalStage2SavePayload({
            ...answers,
            ...(hasOverride ? { [field]: override![field] } : {}),
          })
        : stage2StepPayload(field, value, answers);

      if (
        payload.platforms?.length &&
        payload.primaryPlatform !== undefined
      ) {
        setAnswer("primaryPlatform", payload.primaryPlatform);
      }

      try {
        await saveMutation.mutateAsync(payload);
      } catch (error) {
        setSubmitError(formatChallengeSetupFlowError(error, "save"));
        return;
      }

      if (isLastStep) {
        try {
          const completedStatus = await completeMutation.mutateAsync();
          onComplete(completedStatus);
        } catch (error) {
          setSubmitError(formatChallengeSetupFlowError(error, "complete"));
        }
        return;
      }

      nextStep();
    },
    [
      answers,
      canContinue,
      field,
      isLastStep,
      completeMutation,
      nextStep,
      onComplete,
      saveMutation,
      setAnswer,
      setSubmitError,
    ],
  );

  const back = React.useCallback(async () => {
    if (isFieldValid(field)) {
      try {
        await saveMutation.mutateAsync(
          stage2StepPayload(field, answers[field], answers),
        );
      } catch (error) {
        setSubmitError(formatChallengeSetupFlowError(error, "save"));
        return;
      }
    }

    const target = resolveStage2Back(stepIndex);
    if ("destination" in target) {
      router.push("/dashboard");
      return;
    }
    goToStep(target.stepIndex);
  }, [
    answers,
    field,
    goToStep,
    isFieldValid,
    router,
    saveMutation,
    setSubmitError,
    stepIndex,
  ]);

  const fieldValidation = stage2AnswersSchema.shape[field].safeParse(
    answers[field],
  );

  return {
    answers,
    back,
    canContinue,
    continueFlow,
    field,
    goToStep,
    isFirstStep,
    isLastStep,
    fieldError: fieldValidation.success
      ? ""
      : answers[field] == null
        ? "Choose an answer to continue."
        : (fieldValidation.error.issues[0]?.message ??
          "Choose an answer to continue."),
    isSubmitting: saveMutation.isPending || completeMutation.isPending,
    setAnswer,
    stepIndex,
    submitError,
    totalSteps: stage2Steps.length,
  };
}

function formatChallengeSetupFlowError(
  error: unknown,
  phase: "save" | "complete",
): string {
  if (error instanceof ChallengeSetupServiceError) {
    return error.message;
  }

  const fallback =
    phase === "complete"
      ? "We couldn't match your programme. Your answers are saved; try again."
      : "Something went wrong saving your answer. Please try again.";

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
