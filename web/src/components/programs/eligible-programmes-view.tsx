"use client";

import * as React from "react";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { markEligibleProgrammesSeenAction } from "@/actions/eligible-programmes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { coverForProgramme } from "@/lib/programme-cover";
import { cn } from "@/lib/utils";
import { tierDisplayName } from "@/schemas/billing.schema";
import type { EligibleProgramme } from "@/schemas/eligible-programme.schema";

interface EligibleProgrammesViewProps {
  programmes: EligibleProgramme[];
  /** Rendered as the Programs page's "All Programmes" tab rather than a page. */
  embedded?: boolean;
}

export function EligibleProgrammesView({
  programmes,
  embedded = false,
}: EligibleProgrammesViewProps) {
  // Held from the first render so the newly-unlocked treatment survives the
  // call that clears it. Without this the badges would vanish under the
  // reader's eyes the moment the page settled.
  const [newlyUnlocked] = React.useState(
    () =>
      new Set(
        programmes
          .filter((row) => row.locked && row.newlyUnlocked)
          .map((row) => row.slug),
      ),
  );
  const [startingSlug, setStartingSlug] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (newlyUnlocked.size === 0) {
      return;
    }

    // Fire and forget: failing to clear the watermark shows the treatment
    // again next visit, which is a far better failure than blocking the list.
    void markEligibleProgrammesSeenAction();
  }, [newlyUnlocked]);

  if (programmes.length === 0) {
    return (
      <main className="w-full pb-14">
        <EligibleHeader count={0} embedded={embedded} />
        <section
          aria-labelledby="eligible-empty-title"
          className="rounded-2xl bg-surface p-7.5 text-center"
        >
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-background text-muted">
            <Lock aria-hidden className="size-5" />
          </span>
          <h2
            className="text-xl font-bold tracking-tight text-foreground"
            id="eligible-empty-title"
          >
            No programmes available yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-loose text-muted">
            Nothing is open to you right now. Keep going with your current work
            - programmes unlock as you make progress.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="w-full pb-14">
      <EligibleHeader count={programmes.length} embedded={embedded} />
      <ul className="grid grid-cols-1 gap-5.5 md:grid-cols-2 xl:grid-cols-3">
        {programmes.map((programme) => (
          <EligibleProgrammeCard
            isNew={newlyUnlocked.has(programme.slug)}
            key={programme.slug}
            onStart={() => setStartingSlug(programme.slug)}
            programme={programme}
            busy={startingSlug !== null}
            starting={startingSlug === programme.slug}
          />
        ))}
      </ul>
    </main>
  );
}

function EligibleHeader({
  count,
  embedded,
}: {
  count: number;
  embedded: boolean;
}) {
  if (embedded) {
    return (
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          All Programmes
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {count === 0
            ? "Programmes you unlock will appear here."
            : "Every programme available to you - pick one to get started."}
        </p>
      </header>
    );
  }

  return (
    <header className="mb-6">
      <p className="mb-2 text-xs font-extrabold uppercase text-accent">
        Available to you
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Start a programme
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-loose text-muted">
        {count === 0
          ? "Programmes you unlock will appear here."
          : "Everything here is open to you now. Choosing one takes you to its welcome page - nothing starts until you say so."}
      </p>
    </header>
  );
}

function EligibleProgrammeCard({
  isNew,
  onStart,
  busy,
  programme,
  starting,
}: {
  isNew: boolean;
  onStart: () => void;
  /** A start is in flight somewhere in the list. */
  busy: boolean;
  programme: EligibleProgramme;
  /** This card is the one starting, so it shows the spinner. */
  starting: boolean;
}) {
  return (
    <li
      className={cn(
        "relative flex min-h-64 flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_40px_rgba(0,0,0,0.1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        isNew && "shadow-[inset_0_0_0_2px_var(--accent)]",
      )}
    >
      <div className="relative h-42 shrink-0 bg-foreground">
        <Image
          alt=""
          aria-hidden
          className="object-cover"
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          src={coverForProgramme(programme.slug)}
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isNew ? (
          <span className="flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-2xs font-extrabold uppercase text-accent">
            <Sparkles aria-hidden className="size-3.5" />
            Newly unlocked
          </span>
        ) : null}
        {/*
          Only a gated programme is worth calling unlocked. An unlock record
          against an always-open programme is real but says nothing to the
          user - they could always have started it.
        */}
        {programme.locked && programme.unlocked && !isNew ? (
          <span className="rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted">
            Unlocked
          </span>
        ) : null}
        {programme.requiresUpgrade ? (
          <span className="flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-2xs font-extrabold uppercase text-accent">
            <Lock aria-hidden className="size-3.5" />
            {tierDisplayName(programme.minimumTier)} plan
          </span>
        ) : null}
        {programme.track ? (
          <span className="rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted">
            {programme.track}
          </span>
        ) : null}
        {programme.durationLabel ? (
          <span className="rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted">
            {programme.durationLabel}
          </span>
        ) : null}
      </div>

      <h2 className="text-xl font-bold leading-normal tracking-tight text-foreground">
        {programme.title}
      </h2>
      {programme.description ? (
        <p className="mt-2 line-clamp-3 text-sm leading-loose text-muted">
          {programme.description}
        </p>
      ) : null}

      <ProgrammeTargets label="Platforms" values={programme.targetPlatforms} />
      <ProgrammeTargets label="Content" values={programme.targetContentTypes} />

      <div className="mt-auto pt-5">
        {programme.active ? (
          <span className="flex items-center gap-2 text-sm font-bold text-success">
            <Check aria-hidden className="size-4" strokeWidth={3} />
            Currently active
          </span>
        ) : programme.requiresUpgrade ? (
          <div>
            <Button
              asChild
              className="h-11.5 w-full rounded-full bg-accent text-sm font-bold text-accent-foreground hover:opacity-90"
            >
              <Link href="/settings/account">
                <Lock aria-hidden className="size-4" />
                Upgrade to unlock
              </Link>
            </Button>
            <p className="mt-2 text-2xs font-medium text-muted">
              Included with the {tierDisplayName(programme.minimumTier)} plan.
            </p>
          </div>
        ) : programme.startBlockedByActive ? (
          <div>
            <Button
              className="h-11.5 w-full rounded-full bg-accent text-sm font-bold text-accent-foreground"
              disabled
              type="button"
            >
              Start programme
            </Button>
            <p className="mt-2 text-2xs font-medium text-muted">
              Finish your current programme to start this one.
            </p>
          </div>
        ) : (
          <Button
            asChild
            className="h-11.5 w-full rounded-full bg-accent text-sm font-bold text-accent-foreground hover:opacity-90"
            disabled={busy}
          >
            <Link
              href={`/programs/${encodeURIComponent(programme.slug)}/welcome`}
              onClick={onStart}
            >
              {starting ? <Spinner className="size-4" /> : null}
              Start programme
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        )}
      </div>
      </div>
    </li>
  );
}

// "reel" → "Reel", "instagram" → "Instagram"; vocabulary keys, not prose.
function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ProgrammeTargets({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <p className="mt-2 text-2xs font-medium text-muted">
      <span className="font-bold text-foreground">{label}:</span>{" "}
      {values.map(humanise).join(" · ")}
    </p>
  );
}
