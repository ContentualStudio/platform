"use client";

import { AlertCircle, ArrowLeft, Lock } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatCountdown, maskEmail } from "@/components/auth/auth-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import {
  AdminAuthError,
  sendAdminCode,
  verifyAdminCode,
} from "@/lib/admin/admin-auth-client";

const RESEND_SECONDS = 60;

type Step = "email" | "code";

function errorMessage(error: unknown) {
  if (error instanceof AdminAuthError) {
    return error.code === "INVALID_OTP"
      ? "That code is incorrect or has expired."
      : error.message;
  }

  return "Something went wrong. Please try again.";
}

export function AdminSignIn() {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <AdminSignInAside />
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <AdminSignInForm />
        </div>
      </section>
    </main>
  );
}

function AdminSignInAside() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-immersive-fg/10 bg-immersive-bg p-12 text-immersive-fg lg:flex lg:flex-col lg:justify-between">
      <div className="relative z-10 flex items-center gap-3">
        <span className="relative size-9 overflow-hidden rounded-sm">
          <Image alt="" fill sizes="36px" src="/brand/contentual-favicon.png" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">
          Admin console
        </span>
      </div>

      <div className="relative z-10 flex max-w-md flex-col gap-6">
        <p className="text-4xl font-bold tracking-tight text-immersive-fg">
          Every creator, every programme, one quiet room.
        </p>
        <p className="text-base text-immersive-fg/60">
          Operational visibility for the Contentual team — support accounts,
          follow programmes, and keep the engine honest.
        </p>
      </div>

      <p className="relative z-10 flex items-center gap-2 text-sm text-immersive-fg/50">
        <Lock className="size-4" />
        Restricted to the Contentual team.
      </p>

      {/* Brand glow, anchored to the outer corner so the panel's own edge
          never clips it into a visible seam. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-48 size-112 rounded-full bg-accent/25 blur-3xl"
      />
    </aside>
  );
}

function AdminSignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setPending(true);
    setError("");

    try {
      await sendAdminCode(email.trim());
      setStep("code");
      setCode("");
      setResendIn(RESEND_SECONDS);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || pending) {
      return;
    }

    setPending(true);
    setError("");

    try {
      await verifyAdminCode(email.trim(), value);
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setCode("");
      setPending(false);
    }
  }

  return (
    <div className="auth-screen-enter flex flex-col" key={step}>
      <MobileMark />

      {step === "code" ? (
        <button
          className="mb-8 flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setStep("email");
            setError("");
          }}
          type="button"
        >
          <ArrowLeft className="size-4" />
          Use a different email
        </button>
      ) : null}

      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {step === "email" ? "Sign in" : "Check your inbox"}
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        {step === "email" ? (
          <>
            Only Contentual team accounts can sign in here. We&apos;ll send a 6-digit
            code to your team email.
          </>
        ) : (
          // Only reachable for an admin email: the api refuses anyone else at
          // the first step, so this can say plainly that a code was sent.
          <>
            We sent a 6-digit code to{" "}
            <strong className="font-semibold text-foreground">
              {maskEmail(email.trim())}
            </strong>
            .
          </>
        )}
      </p>

      {step === "email" ? (
        <form className="flex flex-col" onSubmit={requestCode}>
          <label className="mt-8 flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">Work email</span>
            <Input
              autoComplete="email"
              autoFocus
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@contentual.com"
              required
              type="email"
              value={email}
            />
          </label>

          <FormError message={error} />

          <Button className="mt-6 w-full" disabled={pending || !email.trim()} type="submit">
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? "Sending code" : "Continue"}
          </Button>
        </form>
      ) : (
        <>
          <InputOTP
            autoFocus
            containerClassName="mt-8 justify-start"
            disabled={pending}
            inputMode="numeric"
            maxLength={6}
            onChange={(value) => {
              setCode(value);
              if (value.length === 6) {
                void verify(value);
              }
            }}
            pattern="[0-9]*"
            value={code}
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot index={index} isInvalid={Boolean(error)} key={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>

          <FormError message={error} />

          <Button
            className="mt-6 w-full"
            disabled={code.length !== 6 || pending}
            onClick={() => void verify()}
            type="button"
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? "Verifying" : "Sign in"}
          </Button>

          <p className="mt-6 text-sm text-muted-foreground">
            Didn&apos;t get it?{" "}
            <button
              className="font-semibold text-accent-text disabled:cursor-not-allowed disabled:text-muted-foreground"
              disabled={resendIn > 0 || pending}
              onClick={() => void requestCode()}
              type="button"
            >
              {resendIn > 0 ? `Resend in ${formatCountdown(resendIn)}` : "Resend code"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function MobileMark() {
  return (
    <div className="mb-10 flex items-center gap-3 lg:hidden">
      <span className="relative size-8 overflow-hidden rounded-sm">
        <Image alt="" fill sizes="32px" src="/brand/contentual-favicon.png" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-accent-text">
        Admin console
      </span>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p
      className="mt-4 flex items-center gap-2 text-sm font-medium text-destructive"
      role="alert"
    >
      <AlertCircle className="size-4 shrink-0" />
      {message}
    </p>
  ) : null;
}
