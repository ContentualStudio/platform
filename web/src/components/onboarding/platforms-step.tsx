"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { PlatformOptionMark } from "@/components/settings/platform-icons";
import { platformMarks } from "@/lib/platform-marks";
import {
  platformOptions,
  type PlatformOption,
} from "@/schemas/onboarding.schema";
import { cn } from "@/lib/utils";
import { OnboardingHeading } from "./onboarding-heading";

interface PlatformsStepProps {
  value?: PlatformOption[];
  onChange: (value: PlatformOption[]) => void;
}

// Stable empty selection: a fresh `[]` default would change identity per render.
const NO_PLATFORMS: PlatformOption[] = [];

export function PlatformsStep({
  value = NO_PLATFORMS,
  onChange,
}: PlatformsStepProps) {
  function toggle(option: PlatformOption) {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option));
    } else {
      onChange([...value, option]);
    }
  }

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent="content"
        className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-4xl"
        text="Where do you create content?"
      />
      <div className="mb-12 flex w-full flex-col gap-2">
        {platformOptions.map((option) => {
          const selected = value.includes(option);
          const mark = platformMarks[option];
          if (!mark?.icon) {
            return null;
          }

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
              <span className="flex items-center gap-3">
                <PlatformOptionMark
                  brandColor={mark.brandColor}
                  icon={mark.icon}
                  selected={selected}
                />
                {option}
              </span>
              {selected ? <Check className="size-5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
