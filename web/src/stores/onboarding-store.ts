import { create } from "zustand";
import type { Stage1Answers } from "@/schemas/onboarding.schema";

export type Stage1FieldName = keyof Stage1Answers;

export const stage1Steps: Stage1FieldName[] = [
  "name",
  "userType",
  "region",
  "timezone",
  "platforms",
  "experienceLevel",
  "postingFrequency",
  "mainGoal",
  "biggestChallenge",
];

export type Stage1FormState = Partial<Stage1Answers>;

interface OnboardingStore {
  stepIndex: number;
  answers: Stage1FormState;
  submitError: string;
  goToStep: (index: number) => void;
  next: () => void;
  back: () => void;
  setAnswer: <K extends Stage1FieldName>(
    field: K,
    value: Stage1Answers[K],
  ) => void;
  setSubmitError: (message: string) => void;
  hydrate: (answers: Stage1FormState, stepIndex: number) => void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  stepIndex: 0,
  answers: {},
  submitError: "",

  goToStep: (index) =>
    set({ stepIndex: Math.max(0, Math.min(index, stage1Steps.length - 1)) }),

  next: () =>
    set((state) => ({
      stepIndex: Math.min(state.stepIndex + 1, stage1Steps.length - 1),
    })),

  back: () =>
    set((state) => ({
      stepIndex: Math.max(state.stepIndex - 1, 0),
    })),

  setAnswer: (field, value) =>
    set((state) => ({
      answers: { ...state.answers, [field]: value },
      submitError: "",
    })),

  setSubmitError: (message) => set({ submitError: message }),

  hydrate: (answers, stepIndex) =>
    set({
      answers,
      stepIndex: Math.max(0, Math.min(stepIndex, stage1Steps.length - 1)),
    }),
}));
