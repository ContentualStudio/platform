"use client";

import { Input } from "@/components/ui/input";
import { OnboardingHeading } from "./onboarding-heading";

interface NameStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function NameStep({ value, onChange }: NameStepProps) {
  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent="name"
        className="mb-6 text-2xl md:text-4xl font-semibold tracking-tight text-foreground"
        text="What's your name?"
      />
      <Input
        autoFocus
        className="mb-12 h-14 text-lg"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter your name"
        value={value}
      />
    </div>
  );
}
