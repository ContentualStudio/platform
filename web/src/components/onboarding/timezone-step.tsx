"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { OnboardingHeading } from "./onboarding-heading";

interface TimezoneStepProps {
  value?: string;
  onChange: (value: string) => void;
}

export function TimezoneStep({ value, onChange }: TimezoneStepProps) {
  const [query, setQuery] = React.useState(value ?? "");
  const [open, setOpen] = React.useState(false);

  // Keep the input's text in sync when `value` changes for a reason other
  // than typing in this component (auto-detect below, or an option pick) —
  // a render-time sync instead of an effect, per React's guidance for
  // adjusting state from a prop change.
  const [syncedValue, setSyncedValue] = React.useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(value ?? "");
  }

  const zones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  React.useEffect(() => {
    if (!value) {
      onChange(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return zones;
    }

    return zones.filter((zone) => zone.toLowerCase().includes(normalized));
  }, [query, zones]);

  function select(zone: string) {
    onChange(zone);
    setQuery(zone);
    setOpen(false);
  }

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent="timezone"
        className="mb-2 text-4xl font-semibold tracking-tight text-foreground"
        text="Confirm your timezone"
      />
      <p className="mb-6 text-sm text-muted">
        We&apos;ll use this to deliver your daily tasks around 7:00 AM local
        time.
      </p>
      <div className="relative mb-12 w-full">
        <input
          className="contentual-input text-lg"
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Detecting timezone..."
          value={query}
        />
        {open && filtered.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-menu">
            {filtered.map((zone) => (
              <button
                className={cn(
                  "block w-full px-5 py-3 text-left text-base transition-colors hover:bg-surface",
                  value === zone && "bg-accent text-accent-foreground",
                )}
                key={zone}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(zone)}
                type="button"
              >
                {zone}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
