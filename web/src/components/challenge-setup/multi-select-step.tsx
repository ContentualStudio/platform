"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { OnboardingHeading } from "@/components/onboarding/onboarding-heading";
import { PlatformOptionMark } from "@/components/settings/platform-icons";
import { getPlatformMark } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";
import {
  MAX_FOCUS_PLATFORMS,
  togglePlatformSelection,
} from "./platform-selection";

interface MultiSelectStepProps<T extends string> {
  heading: string;
  accent?: string;
  options: readonly T[];
  value?: T[];
  onChange: (value: T[]) => void;
}

// Stable empty selection: a fresh `[]` default would change identity per render.
const NO_SELECTION: string[] = [];

export function MultiSelectStep<T extends string>({
  heading,
  accent,
  options,
  value = NO_SELECTION as T[],
  onChange,
}: MultiSelectStepProps<T>) {
  const [limitReached, setLimitReached] = React.useState(false);

  function toggle(option: T) {
    const result = togglePlatformSelection(value, option);
    setLimitReached(result.limitReached);
    onChange(result.selection);
  }

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent={accent}
        className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-4xl"
        text={heading}
      />
      <div className="mb-12 flex w-full flex-col gap-2">
        {options.map((option) => {
          const selected = value.includes(option);
          const mark = getPlatformMark(option);

          return (
            <button
              className={cn(
                "flex min-h-[52px] w-full items-center justify-between rounded-lg px-5 text-left text-base transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "bg-control text-foreground hover:bg-control-hover",
              )}
              key={option}
              onClick={() => toggle(option)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                {mark?.icon ? (
                  <PlatformOptionMark
                    brandColor={mark.brandColor}
                    icon={mark.icon}
                    selected={selected}
                  />
                ) : null}
                <span>{option}</span>
              </span>
              {selected ? <Check className="size-5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
      <p
        aria-live="polite"
        className={cn(
          "-mt-8 mb-8 text-sm",
          limitReached ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {limitReached
          ? `You can choose up to ${MAX_FOCUS_PLATFORMS} platforms. Remove one to choose another.`
          : `Choose up to ${MAX_FOCUS_PLATFORMS}. Other platforms are saved for future access.`}
      </p>
    </div>
  );
}
