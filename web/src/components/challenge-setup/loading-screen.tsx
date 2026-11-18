"use client";

import * as React from "react";
import { CeeMascot } from "@/components/brand/cee-mascot";
import { cn } from "@/lib/utils";

const STAGE_TWO_DELAY_MS = 1_200;

export function LoadingScreen() {
  const [stage, setStage] = React.useState<1 | 2>(1);
  const reducedMotion = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  React.useEffect(() => {
    if (reducedMotion) {
      setStage(2);
      return;
    }

    const timer = window.setTimeout(() => setStage(2), STAGE_TWO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <div
      aria-live="polite"
      className="relative mx-auto flex min-h-screen w-full max-w-170 flex-col items-center justify-center px-6 py-16 text-center"
      role="status"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[url('/brand/testimonial-bg.png')] bg-[length:auto] bg-[center_bottom] bg-no-repeat opacity-80"
      />
      <div aria-hidden className="relative z-1 mb-7 size-40">
        <div className="pointer-events-none absolute top-1/2 left-1/2 size-85 -translate-1/2 rounded-full bg-[radial-gradient(ellipse,var(--ds-accent-selection)_0%,transparent_68%)]" />
        <CeeMascot
          className="absolute inset-4"
          expression={stage === 2 ? "idea" : "looking"}
          size={128}
        />
      </div>

      <h2 className="relative z-1 max-w-130 text-3xl font-black leading-tight tracking-tight text-foreground">
        {stage === 2
          ? "Your personalised programme is ready"
          : "Finding the right programme for you"}
      </h2>
      <p className="relative z-1 mt-3 max-w-135 text-sm leading-relaxed text-muted">
        {stage === 2
          ? "We matched your goals, experience, and available time to the programme most likely to help you build momentum."
          : "Comparing your goals, experience, available time, and Instagram focus with the programmes most likely to help you build momentum."}
      </p>

      <div
        aria-label="Programme matching progress"
        className="relative z-1 mt-7 flex items-center gap-2.5 text-xs font-bold text-muted"
      >
        <MatchStep complete label="Profile understood" />
        <span aria-hidden className="h-px w-7 bg-border" />
        <MatchStep active={stage === 1} complete={stage === 2} label="Matching programme" />
      </div>
    </div>
  );
}

function MatchStep({
  label,
  active = false,
  complete = false,
}: {
  label: string;
  active?: boolean;
  complete?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full bg-border",
          complete && "bg-success",
          active &&
            "bg-accent motion-safe:animate-pulse shadow-[0_0_0_5px_rgba(249,86,22,0.12)]",
        )}
      />
      {label}
    </span>
  );
}
