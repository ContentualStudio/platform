"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { OnboardingHeading } from "@/components/onboarding/onboarding-heading";
import { PlatformOptionMark } from "@/components/settings/platform-icons";
import { getPlatformMark } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";
import type { PlatformOption } from "@/schemas/challenge-setup.schema";

interface PrimaryPlatformStepProps {
  platforms: PlatformOption[];
  value?: PlatformOption | null;
  onChange: (value: PlatformOption | null) => void;
}

export function PrimaryPlatformStep({
  platforms,
  value,
  onChange,
}: PrimaryPlatformStepProps) {
  React.useEffect(() => {
    if (platforms.length === 1 && value !== platforms[0]) {
      onChange(platforms[0]);
    } else if (platforms.length > 1 && value && !platforms.includes(value)) {
      onChange(null);
    }
  }, [onChange, platforms, value]);

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent="primary focus"
        className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-4xl"
        text="Which platform is your primary focus?"
      />
      <p className="mb-8 text-muted-foreground">
        We’ll use this to tailor the programme when you create on more than one
        platform.
      </p>
      <div className="mb-12 flex w-full flex-col gap-2">
        {platforms.map((platform) => {
          const selected = value === platform;
          const mark = getPlatformMark(platform);

          return (
            <button
              className={cn(
                "flex min-h-[52px] w-full items-center justify-between rounded-lg px-5 text-left text-base transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "bg-control text-foreground hover:bg-control-hover",
              )}
              key={platform}
              onClick={() => onChange(platform)}
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
                <span>{platform}</span>
              </span>
              {selected ? <Check className="size-5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
