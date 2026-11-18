"use client";

import { useMutation } from "@tanstack/react-query";
import { saveStage1Partial } from "@/services/onboarding.service";

export function useSaveStage1StepMutation() {
  return useMutation({
    mutationFn: saveStage1Partial,
  });
}
