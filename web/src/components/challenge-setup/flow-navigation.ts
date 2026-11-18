export type Stage2BackTarget =
  { destination: "dashboard" } | { stepIndex: number };

export const COMPLETION_LOADING_DURATION_MS = 2_500;

export function resolveStage2Back(stepIndex: number): Stage2BackTarget {
  return stepIndex <= 0
    ? { destination: "dashboard" }
    : { stepIndex: stepIndex - 1 };
}
