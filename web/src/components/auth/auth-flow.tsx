"use client";

import { Suspense } from "react";
import { AuthErrorParamSync } from "@/components/auth/auth-error-param-sync";
import { AuthCollage } from "@/components/auth/auth-collage";
import { CodeAuthScreen } from "@/components/auth/code-auth-screen";
import { EmailAuthScreen } from "@/components/auth/email-auth-screen";
import { SignupStartScreen } from "@/components/auth/signup-start-screen";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuthFlow } from "@/hooks/auth/use-auth-flow";
import type { AuthIntent } from "@/schemas/auth.schema";

export interface AuthFlowProps {
  /** "login" refuses to create an account; "signup" refuses to reuse one. */
  mode: AuthIntent;
}

export function AuthFlow({ mode }: AuthFlowProps) {
  const auth = useAuthFlow(mode);

  return (
    <main className="flex min-h-screen w-full bg-background text-foreground">
      {/* Renders nothing; keeps the suspending `?error=` read out of the form
          so the card below stays in the prerendered shell. */}
      <Suspense fallback={null}>
        <AuthErrorParamSync />
      </Suspense>

      <div className="flex w-full flex-col items-center justify-center px-6 py-16 md:w-1/2">
        <div className="mx-auto flex w-full max-w-[352px] flex-col items-center">
          {auth.step === "start" ? (
            <SignupStartScreen
              authError={auth.authError}
              isGoogleLoading={auth.isGoogleLoading}
              onContinueWithEmail={auth.continueWithEmail}
              onGoogleAuth={auth.continueWithGoogle}
            />
          ) : auth.step === "email" ? (
            <EmailAuthScreen
              authError={auth.authError}
              email={auth.email}
              emailError={auth.emailError}
              isGoogleLoading={auth.isGoogleLoading}
              isSending={auth.isSending}
              mode={auth.mode}
              onEmailChange={auth.setEmail}
              onGoogleAuth={auth.continueWithGoogle}
              onSubmit={auth.sendCode}
            />
          ) : (
            <CodeAuthScreen
              authError={auth.authError}
              code={auth.code}
              codeError={auth.codeError}
              email={auth.email}
              isSending={auth.isSending}
              isGoogleLoading={auth.isGoogleLoading}
              isVerifying={auth.isVerifying}
              onChangeEmail={auth.changeEmail}
              onCodeChange={auth.setCode}
              onGoogleAuth={auth.continueWithGoogle}
              onResendCode={() => void auth.resendCode()}
              onVerifyCode={() => void auth.verifyCode()}
              secondsUntilResend={auth.secondsUntilResend}
            />
          )}
        </div>
      </div>

      <div className="fixed inset-y-0 right-0 hidden w-1/2 md:block">
        <AuthCollage />
      </div>

      <ThemeToggle className="fixed bottom-6 left-6" />
    </main>
  );
}
