import { AlertCircle } from "lucide-react";
import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthLogo } from "@/components/auth/auth-logo";
import {
  formatCountdown,
  maskEmail,
} from "@/components/auth/auth-utils";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface CodeAuthScreenProps {
  authError?: string;
  code: string;
  codeError: string;
  email: string;
  isSending: boolean;
  isGoogleLoading: boolean;
  isVerifying: boolean;
  secondsUntilResend: number;
  onChangeEmail: () => void;
  onCodeChange: (code: string) => void;
  onGoogleAuth: () => void;
  onResendCode: () => void;
  onVerifyCode: () => void;
}

export function CodeAuthScreen({
  authError,
  code,
  codeError,
  email,
  isSending,
  isGoogleLoading,
  isVerifying,
  secondsUntilResend,
  onChangeEmail,
  onCodeChange,
  onGoogleAuth,
  onResendCode,
  onVerifyCode,
}: CodeAuthScreenProps) {
  return (
    <div className="auth-screen-enter flex w-full flex-col items-center">
      <CardHeader className="mb-8 p-0">
        <AuthLogo />
        <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
        <CardDescription className="mt-2">
          We sent a 6-digit code to{" "}
          <strong className="font-semibold text-foreground">
            {maskEmail(email)}
          </strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <InputOTP
          autoFocus
          disabled={isVerifying}
          inputMode="numeric"
          maxLength={6}
          onChange={onCodeChange}
          pattern="[0-9]*"
          value={code}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }).map((_, index) => (
              <InputOTPSlot
                index={index}
                isInvalid={Boolean(codeError)}
                key={index}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {codeError ? (
          <div
            className="mt-4 flex w-full items-center justify-center gap-2 text-center text-sm font-medium leading-body text-destructive"
            role="alert"
          >
            <AlertCircle data-icon="inline-start" />
            <span>{codeError}</span>
          </div>
        ) : null}

        <Button
          className={cn("w-full", codeError ? "mt-4" : "mt-8")}
          disabled={code.length !== 6 || isVerifying}
          onClick={onVerifyCode}
          type="button"
        >
          {isVerifying ? <Spinner data-icon="inline-start" /> : null}
          <span>{isVerifying ? "Verifying" : "Verify"}</span>
        </Button>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm text-muted">
          <span>Didn&apos;t receive the code?</span>
          <button
            className="font-semibold text-accent transition-opacity duration-200 ease-contentual disabled:cursor-not-allowed disabled:text-muted"
            disabled={secondsUntilResend > 0 || isSending}
            onClick={onResendCode}
            type="button"
          >
            {secondsUntilResend > 0
              ? `Resend in ${formatCountdown(secondsUntilResend)}`
              : isSending
                ? "Resending"
                : "Resend code"}
          </button>
        </div>

        <button
          className="mx-auto mt-2 block text-sm font-medium text-muted transition-colors duration-200 ease-contentual hover:text-foreground"
          onClick={onChangeEmail}
          type="button"
        >
          Change email address
        </button>

        <AuthDivider />
        <GoogleAuthButton isLoading={isGoogleLoading} onClick={onGoogleAuth} />
        {authError ? (
          <div
            className="mt-4 flex w-full items-center justify-center gap-2 text-center text-sm font-medium leading-body text-destructive"
            role="alert"
          >
            <AlertCircle data-icon="inline-start" />
            <span>{authError}</span>
          </div>
        ) : null}
      </CardContent>
    </div>
  );
}
