"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { dismissProgrammeSuggestionAction } from "@/actions/programme-suggestion";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ProgrammeSuggestion } from "@/schemas/programme-suggestion.schema";

interface ProgrammeSuggestionCtaProps {
  suggestion: ProgrammeSuggestion;
}

/**
 * An invitation, never a gate. It sits inline with the rest of the dashboard,
 * and starting only opens the programme's Welcome Page — the start itself is
 * recorded there, so nothing here enrols the user.
 */
export function ProgrammeSuggestionCta({ suggestion }: ProgrammeSuggestionCtaProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (dismissed) {
    return null;
  }

  const dismiss = async () => {
    // Hidden at once: waiting on the round trip would make dismiss feel
    // broken. A failure puts it back with the reason.
    setDismissed(true);
    setError(null);

    const result = await dismissProgrammeSuggestionAction({ id: suggestion.id });

    if (!result.ok) {
      setDismissed(false);
      setError(result.message);
    }
  };

  return (
    <section
      aria-labelledby="programme-suggestion-title"
      className="relative mb-6 flex flex-col gap-5 rounded-2xl bg-surface p-6 pr-14 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between md:p-7.5 md:pr-16"
    >
      <div className="min-w-0">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase text-accent">
          <Sparkles aria-hidden className="size-3.5" />
          Suggested next
          {suggestion.track ? (
            <span className="ml-1 rounded-full bg-background px-2 py-0.5 text-2xs font-bold normal-case text-muted-foreground">
              {suggestion.track}
            </span>
          ) : null}
        </p>
        <h2
          className="text-xl font-bold tracking-tight text-foreground"
          id="programme-suggestion-title"
        >
          {suggestion.title}
        </h2>
        {suggestion.description ? (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {suggestion.description}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        asChild
        className="h-11.5 shrink-0 rounded-full bg-accent px-6 text-sm font-bold text-accent-foreground hover:opacity-90"
      >
        <Link href={`/programs/${encodeURIComponent(suggestion.slug)}/welcome`}>
          <StartLabel />
        </Link>
      </Button>

      <button
        aria-label={`Dismiss suggestion: ${suggestion.title}`}
        className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}

// Pending comes from the router rather than local state: a flag set on click
// survives the dashboard being restored from the router cache on Back, which
// left the button spinning after the user had already returned.
function StartLabel() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-busy={pending}
      className={cn("flex items-center gap-2", pending && "pointer-events-none opacity-70")}
    >
      {pending ? <Spinner className="size-4" /> : null}
      Start programme
      <ArrowRight aria-hidden className="size-4" />
    </span>
  );
}
