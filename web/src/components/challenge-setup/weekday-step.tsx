"use client";

import { Check } from "lucide-react";
import { OnboardingHeading } from "@/components/onboarding/onboarding-heading";
import { cn } from "@/lib/utils";
import {
  weekdayOptions,
  type Weekday,
} from "@/schemas/challenge-setup.schema";

interface WeekdayStepProps {
  heading: string;
  accent?: string;
  value?: Weekday[];
  maxSelection?: number;
  onChange: (value: Weekday[]) => void;
}

// Stable empty selection: a fresh `[]` default would change identity per render.
const NO_SELECTION: Weekday[] = [];

export function WeekdayStep({
  heading,
  accent,
  value = NO_SELECTION,
  maxSelection,
  onChange,
}: WeekdayStepProps) {
  function toggle(day: Weekday) {
    if (value.includes(day)) {
      onChange(value.filter((item) => item !== day));
      return;
    }

    if (maxSelection !== undefined && value.length >= maxSelection) {
      return;
    }

    onChange([...value, day]);
  }

  const atLimit =
    maxSelection !== undefined &&
    value.length >= maxSelection &&
    maxSelection > 0;

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent={accent}
        className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-4xl"
        text={heading}
      />
      {maxSelection !== undefined ? (
        <p className="mb-4 text-sm text-muted" id="weekday-limit">
          Select up to {maxSelection} {maxSelection === 1 ? "day" : "days"} to
          match your weekly commitment.
        </p>
      ) : null}
      <div
        aria-describedby={maxSelection !== undefined ? "weekday-limit" : undefined}
        className="mb-12 flex w-full flex-col gap-2"
      >
        {weekdayOptions.map((day) => {
          const selected = value.includes(day);
          const disabled = !selected && atLimit;

          return (
            <button
              aria-disabled={disabled || undefined}
              className={cn(
                "flex min-h-[52px] w-full items-center justify-between rounded-lg px-5 text-left text-base transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : disabled
                    ? "cursor-not-allowed bg-control/60 text-muted"
                    : "bg-control text-foreground hover:bg-control-hover",
              )}
              disabled={disabled}
              key={day}
              onClick={() => toggle(day)}
              type="button"
            >
              {day}
              {selected ? <Check className="size-5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
