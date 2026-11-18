import { create } from "zustand";
import { resendWindowSeconds } from "@/components/auth/auth-utils";
import type { AuthIntent } from "@/schemas/auth.schema";

/**
 * "start" is the sign-up provider picker, which login skips — a returning user
 * lands straight on the email field.
 */
export type AuthStep = "start" | "email" | "code";

interface AuthStore {
  authError: string;
  code: string;
  codeError: string;
  email: string;
  emailError: string;
  mode: AuthIntent;
  secondsUntilResend: number;
  step: AuthStep;
  changeEmail: () => void;
  clearCodeError: () => void;
  decrementResendTimer: () => void;
  reset: () => void;
  resetCodeEntry: () => void;
  setAuthError: (error: string) => void;
  setCode: (code: string) => void;
  setCodeError: (error: string) => void;
  setEmail: (email: string) => void;
  setEmailError: (error: string) => void;
  setMode: (mode: AuthIntent) => void;
  showCodeStep: (email: string) => void;
  showEmailStep: () => void;
  startResendTimer: () => void;
}

export function initialStepForMode(mode: AuthIntent): AuthStep {
  return mode === "signup" ? "start" : "email";
}

const initialState = {
  // Holds the OAuth `?error=` message too, which AuthErrorParamSync writes in
  // from its own Suspense boundary rather than the form reading it directly.
  authError: "",
  code: "",
  codeError: "",
  email: "",
  emailError: "",
  mode: "login" as AuthIntent,
  secondsUntilResend: resendWindowSeconds,
  step: "email" as AuthStep,
};

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialState,

  changeEmail: () =>
    set({
      code: "",
      codeError: "",
      step: "email",
    }),

  clearCodeError: () => set({ codeError: "" }),

  decrementResendTimer: () =>
    set((state) => ({
      secondsUntilResend: Math.max(state.secondsUntilResend - 1, 0),
    })),

  reset: () => set(initialState),

  resetCodeEntry: () =>
    set({
      code: "",
      codeError: "",
    }),

  setAuthError: (error) => set({ authError: error }),

  setCode: (code) =>
    set((state) => ({
      code: code.replace(/\D/g, ""),
      codeError: state.codeError ? "" : state.codeError,
    })),

  setCodeError: (error) => set({ codeError: error }),

  setEmail: (email) =>
    set((state) => ({
      email,
      emailError: state.emailError ? "" : state.emailError,
    })),

  setEmailError: (error) => set({ emailError: error }),

  // Cache Components keeps routes mounted, so moving between /auth/sign and
  // /auth/signup would otherwise carry a half-finished flow across. Clearing
  // on the mode change keeps each door's state its own.
  setMode: (mode) =>
    set((state) =>
      state.mode === mode
        ? {}
        : { ...initialState, mode, step: initialStepForMode(mode) },
    ),

  showCodeStep: (email) =>
    set({
      code: "",
      codeError: "",
      email,
      emailError: "",
      secondsUntilResend: resendWindowSeconds,
      step: "code",
    }),

  showEmailStep: () => set({ emailError: "", step: "email" }),

  startResendTimer: () =>
    set({
      secondsUntilResend: resendWindowSeconds,
    }),
}));
