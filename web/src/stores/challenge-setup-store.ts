import { create } from "zustand";
import type { Stage2Answers } from "@/schemas/challenge-setup.schema";

export type Stage2FieldName = keyof Stage2Answers;

export const stage2Steps: Stage2FieldName[] = [
  "platforms",
  "postingGoal",
  "weeklyCommitment",
  "availableDays",
  "sawTestimonial",
  "nicheDefined",
  "contentType",
  "followerRange",
  "instagramConnected",
  "milestone",
];

export type Stage2FormState = Partial<Stage2Answers>;

interface ChallengeSetupStore {
  stepIndex: number;
  answers: Stage2FormState;
  submitError: string;
  goToStep: (index: number) => void;
  next: () => void;
  back: () => void;
  setAnswer: <K extends Stage2FieldName>(
    field: K,
    value: Stage2Answers[K],
  ) => void;
  setSubmitError: (message: string) => void;
  hydrate: (answers: Stage2FormState, stepIndex: number) => void;
}

export const useChallengeSetupStore = create<ChallengeSetupStore>((set) => ({
  stepIndex: 0,
  answers: { milestone: "", sawTestimonial: true },
  submitError: "",

  goToStep: (index) =>
    set({ stepIndex: Math.max(0, Math.min(index, stage2Steps.length - 1)) }),

  next: () =>
    set((state) => ({
      stepIndex: Math.min(state.stepIndex + 1, stage2Steps.length - 1),
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
      stepIndex: Math.max(0, Math.min(stepIndex, stage2Steps.length - 1)),
    }),
}));
