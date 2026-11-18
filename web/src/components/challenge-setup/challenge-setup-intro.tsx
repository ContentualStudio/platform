"use client";

import { ArrowLeft, ArrowRight, Check, Clock3 } from "lucide-react";
import { CeeMascot } from "@/components/brand/cee-mascot";
import { Button } from "@/components/ui/button";

interface ChallengeSetupIntroProps {
  name: string | null;
  onBack: () => void;
  onContinue: () => void;
}

export function ChallengeSetupIntro({
  name,
  onBack,
  onContinue,
}: ChallengeSetupIntroProps) {
  return (
    <div className="relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-6 py-10 text-foreground sm:py-14">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-10 z-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,var(--ds-accent-glow)_0%,transparent_68%)] opacity-80"
      />

      <main className="auth-screen-enter relative z-1 flex w-full max-w-[760px] flex-col items-center text-center">
        <CeeMascot className="mb-8" size={132} />

        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">
          Your next programme starts here
        </p>
        <h1 className="max-w-[680px] text-fluid-md font-semibold leading-tight tracking-tighter text-balance">
          Let&apos;s set up your first programme
          {name ? (
            <>
              ,
              <span className="mt-2 block font-georgia font-normal italic text-accent">
                {name}.
              </span>
            </>
          ) : (
            "."
          )}
        </h1>

        <section className="mt-9 w-full rounded-4xl border border-border bg-surface px-8 py-8 shadow-raised sm:px-10 sm:py-9">
          <h2 className="text-xl font-bold text-foreground">
            First, I&apos;ll ask you a few quick questions.
          </h2>
          <p className="mx-auto mt-4 max-w-[570px] text-base leading-relaxed text-muted-foreground">
            Your answers help me tailor the right programme to your goals,
            schedule and content style.
          </p>

          <div className="mx-auto mt-6 flex max-w-[560px] flex-wrap justify-center gap-3 text-sm font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2">
              <Clock3 aria-hidden className="size-4 text-accent" />
              About 3 minutes
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2">
              <Check aria-hidden className="size-4 text-accent" />
              Progress saves as you go
            </span>
          </div>

          <Button className="mt-7 min-w-[220px]" onClick={onContinue}>
            Let&apos;s get started
            <ArrowRight aria-hidden data-icon="inline-end" />
          </Button>
        </section>

        <button
          aria-label="Back to dashboard"
          className="mt-8 flex size-11 items-center justify-center rounded-full border border-foreground bg-background text-foreground transition-[background,transform] hover:scale-105 hover:bg-surface"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
      </main>
    </div>
  );
}
