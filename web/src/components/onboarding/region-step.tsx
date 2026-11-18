"use client";

import * as React from "react";
import { countries } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { OnboardingHeading } from "./onboarding-heading";

interface RegionStepProps {
  value?: string;
  onChange: (value: string) => void;
}

export function RegionStep({ value, onChange }: RegionStepProps) {
  const [query, setQuery] = React.useState(value ?? "");
  const [open, setOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return countries;
    }

    return countries.filter((country) =>
      country.name.toLowerCase().includes(normalized),
    );
  }, [query]);

  function select(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  return (
    <div className="flex w-full flex-col items-start">
      <OnboardingHeading
        accent="based"
        className="mb-6 text-2xl md:text-4xl font-semibold tracking-tight text-foreground"
        text="Where are you based?"
      />
      <div className="relative mb-12 w-full">
        <input
          className="contentual-input text-lg"
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for your country..."
          value={query}
        />
        {open && filtered.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-menu">
            {filtered.map((country) => (
              <button
                className={cn(
                  "block w-full px-5 py-3 text-left text-base transition-colors hover:bg-surface",
                  value === country.name && "bg-accent text-accent-foreground",
                )}
                key={country.code}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(country.name)}
                type="button"
              >
                {country.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
