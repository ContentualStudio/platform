"use client";

import { useMutation } from "@tanstack/react-query";
import { completeStage2Action } from "@/actions/challenge-setup";
import {
  beginProgramme,
  ChallengeSetupServiceError,
  saveStage2Partial,
  startProgramme,
} from "@/services/challenge-setup.service";

export function useSaveStage2StepMutation() {
  return useMutation({
    mutationFn: saveStage2Partial,
  });
}

export function useCompleteStage2Mutation() {
  return useMutation({
    mutationFn: async () => {
      const result = await completeStage2Action();
      if (!result.ok) {
        throw new ChallengeSetupServiceError(result.message, result.code);
      }
      return result.data;
    },
  });
}

export function useBeginProgrammeMutation() {
  return useMutation({
    mutationFn: beginProgramme,
  });
}

export function useStartProgrammeMutation() {
  return useMutation({
    mutationFn: startProgramme,
  });
}
