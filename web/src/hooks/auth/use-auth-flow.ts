"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  getAuthErrorMessage,
} from "@/components/auth/auth-utils";
import {
  useSendEmailCodeMutation,
  useVerifyEmailCodeMutation,
} from "@/hooks/auth/use-auth-mutations";
import { type AuthIntent, emailSchema } from "@/schemas/auth.schema";
import { getGoogleAuthUrl } from "@/services/auth.service";
import { initialStepForMode, useAuthStore } from "@/stores/auth-store";

export function useAuthFlow(mode: AuthIntent) {
  const router = useRouter();
  const lastSubmittedCode = React.useRef("");
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const sendCodeMutation = useSendEmailCodeMutation();
  const verifyCodeMutation = useVerifyEmailCodeMutation();

  // Lives in the store, not local state: AuthErrorParamSync writes the OAuth
  // `?error=` message in from a sibling Suspense boundary.
  const authError = useAuthStore((state) => state.authError);
  const setAuthError = useAuthStore((state) => state.setAuthError);
  const code = useAuthStore((state) => state.code);
  const codeError = useAuthStore((state) => state.codeError);
  const email = useAuthStore((state) => state.email);
  const emailError = useAuthStore((state) => state.emailError);
  const secondsUntilResend = useAuthStore((state) => state.secondsUntilResend);
  const storedMode = useAuthStore((state) => state.mode);
  const storedStep = useAuthStore((state) => state.step);
  const setMode = useAuthStore((state) => state.setMode);
  const showEmailStep = useAuthStore((state) => state.showEmailStep);
  const changeEmailInStore = useAuthStore((state) => state.changeEmail);
  const decrementResendTimer = useAuthStore(
    (state) => state.decrementResendTimer,
  );
  const resetCodeEntry = useAuthStore((state) => state.resetCodeEntry);
  const setCode = useAuthStore((state) => state.setCode);
  const setCodeError = useAuthStore((state) => state.setCodeError);
  const setEmail = useAuthStore((state) => state.setEmail);
  const setEmailError = useAuthStore((state) => state.setEmailError);
  const showCodeStep = useAuthStore((state) => state.showCodeStep);
  const startResendTimer = useAuthStore((state) => state.startResendTimer);

  React.useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);

  // The effect above lands a frame after render, so derive the step the current
  // mode should show rather than briefly rendering the previous door's screen.
  const step = storedMode === mode ? storedStep : initialStepForMode(mode);

  React.useEffect(() => {
    if (step !== "code" || secondsUntilResend <= 0) {
      return;
    }

    const timer = window.setTimeout(decrementResendTimer, 1000);

    return () => window.clearTimeout(timer);
  }, [decrementResendTimer, secondsUntilResend, step]);

  const sendCode = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const emailResult = emailSchema.safeParse(email);

      if (!emailResult.success) {
        setEmailError(emailResult.error.issues[0]?.message ?? "Invalid email.");
        return;
      }

      try {
        setAuthError("");
        await sendCodeMutation.mutateAsync({
          email: emailResult.data,
          intent: mode,
        });
        lastSubmittedCode.current = "";
        showCodeStep(emailResult.data);
      } catch (error) {
        setEmailError(
          getAuthErrorMessage(
            error,
            "We could not send a code. Please try again.",
          ),
        );
      }
    },
    [email, mode, sendCodeMutation, setAuthError, setEmailError, showCodeStep],
  );

  const verifyCode = React.useCallback(
    async (candidateCode = code) => {
      if (candidateCode.length !== 6 || verifyCodeMutation.isPending) {
        return;
      }

      try {
        const payload = await verifyCodeMutation.mutateAsync({
          code: candidateCode,
          email,
          intent: mode,
        });

        router.replace(payload.redirectTo ?? "/onboarding");
      } catch (error) {
        lastSubmittedCode.current = "";
        resetCodeEntry();
        setCodeError(
          getAuthErrorMessage(error, "Invalid code. Please try again."),
        );
      }
    },
    [
      code,
      email,
      mode,
      resetCodeEntry,
      router,
      setCodeError,
      verifyCodeMutation,
    ],
  );

  React.useEffect(() => {
    if (
      step === "code" &&
      code.length === 6 &&
      code !== lastSubmittedCode.current
    ) {
      lastSubmittedCode.current = code;
      void verifyCode(code);
    }
  }, [code, step, verifyCode]);

  const resendCode = React.useCallback(async () => {
    if (secondsUntilResend > 0 || sendCodeMutation.isPending) {
      return;
    }

    resetCodeEntry();
    await sendCode();
    startResendTimer();
  }, [
    resetCodeEntry,
    secondsUntilResend,
    sendCode,
    sendCodeMutation.isPending,
    startResendTimer,
  ]);

  const changeEmail = React.useCallback(() => {
    changeEmailInStore();
    lastSubmittedCode.current = "";
  }, [changeEmailInStore]);

  // Coming back from Google with the Back button restores this page from the
  // back/forward cache with the spinner still on, and nothing else resets it.
  React.useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setIsGoogleLoading(false);
      }
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const continueWithGoogle = React.useCallback(() => {
    setAuthError("");
    setIsGoogleLoading(true);
    window.location.assign(getGoogleAuthUrl(mode));
  }, [mode, setAuthError]);

  return {
    code,
    codeError,
    email,
    emailError,
    authError,
    isSending: sendCodeMutation.isPending,
    isGoogleLoading,
    isVerifying: verifyCodeMutation.isPending,
    mode,
    secondsUntilResend,
    step,
    changeEmail,
    continueWithEmail: showEmailStep,
    continueWithGoogle,
    resendCode,
    sendCode,
    setCode,
    setEmail,
    verifyCode,
  };
}
