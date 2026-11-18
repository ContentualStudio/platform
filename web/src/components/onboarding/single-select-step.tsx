"use client";

import { cn } from "@/lib/utils";
import { OnboardingHeading } from "./onboarding-heading";

interface SingleSelectStepProps<T extends string> {
  heading: string;
  accent?: string;
  options: readonly T[];
  value?: T;
  onChange: (value: T) => void;
}

export function SingleSelectStep<T extends string>({
  heading,
  accent,
  options,
  value,
  onChange,
}: SingleSelectStepProps<T>) {
  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent={accent}
        className="mb-6 text-4xl font-semibold tracking-tight text-foreground"
        text={heading}
      />
      <div className="mb-12 flex w-full flex-col gap-2">
        {options.map((option) => (
          <button
            className={cn(
              "flex min-h-[52px] w-full items-center rounded-lg px-5 text-left text-base transition-colors",
              value === option
                ? "bg-accent text-accent-foreground"
                : "bg-control text-foreground hover:bg-control-hover",
            )}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
