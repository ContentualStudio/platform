"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { OnboardingHeading } from "@/components/onboarding/onboarding-heading";

interface NumberStepperStepProps {
  heading: string;
  accent?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

export function NumberStepperStep({
  heading,
  accent,
  value,
  min = 1,
  max = 7,
  onChange,
}: NumberStepperStepProps) {
  const current = value ?? min;

  React.useEffect(() => {
    if (value === undefined) {
      onChange(min);
    }
  }, [min, onChange, value]);

  function adjust(delta: number) {
    const next = Math.min(max, Math.max(min, current + delta));
    onChange(next);
  }

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent={accent}
        className="mb-8 text-2xl font-semibold tracking-tight text-foreground md:text-4xl"
        text={heading}
      />
      <div className="mb-12 flex items-center gap-6">
        <button
          aria-label="Decrease days per week"
          className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-xl font-semibold text-foreground transition-colors hover:bg-control disabled:cursor-not-allowed disabled:opacity-40"
          disabled={current <= min}
          onClick={() => adjust(-1)}
          type="button"
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <span
          aria-live="polite"
          className="min-w-12 text-center text-3xl font-bold leading-none text-foreground"
        >
          {current}
        </span>
        <button
          aria-label="Increase days per week"
          className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-xl font-semibold text-foreground transition-colors hover:bg-control disabled:cursor-not-allowed disabled:opacity-40"
          disabled={current >= max}
          onClick={() => adjust(1)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
