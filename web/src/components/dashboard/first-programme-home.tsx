"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clock, Compass, Link2, Sparkles } from "lucide-react";
import { coverForProgramme } from "@/lib/programme-cover";
import { cn } from "@/lib/utils";
import type { EligibleProgramme } from "@/schemas/eligible-programme.schema";

export interface FirstProgrammeHomeProps {
  /** True once the user has started any programme; the card then reads "Next". */
  hasChosenBefore: boolean;
  /** Real connection state; the "Connect" row ticks itself off when true. */
  accountsConnected: boolean;
  /** Up to three programmes the user can start now. */
  programmes: EligibleProgramme[];
}

type SetupKey = "browse-programmes" | "connect-accounts" | "meet-cee";

interface SetupRow {
  key: SetupKey;
  label: string;
  title: string;
  meta: string;
  href: string;
  icon: typeof Compass;
}

const SETUP_ROWS: SetupRow[] = [
  {
    key: "browse-programmes",
    label: "Explore",
    title: "Browse programmes",
    meta: "15-day and 30-day programmes.",
    href: "/programs?tab=programmes",
    icon: Compass,
  },
  {
    key: "connect-accounts",
    label: "Setup",
    title: "Connect your accounts",
    meta: "Activate analytics for your posts.",
    href: "/platforms",
    icon: Link2,
  },
  {
    key: "meet-cee",
    label: "Guide",
    title: "Meet Cee",
    meta: "Your AI content guide - coming soon.",
    href: "/dashboard/cee-ai",
    icon: Clock,
  },
];

// Visiting a page is a per-device nudge, not a record worth a server round
// trip; connecting accounts is the exception and comes from real state.
const VISITED_KEY = "contentual-home-actions-v1";

function readVisited(): Partial<Record<SetupKey, boolean>> {
  try {
    return JSON.parse(window.localStorage.getItem(VISITED_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function markVisited(key: SetupKey) {
  try {
    const next = { ...readVisited(), [key]: true };
    window.localStorage.setItem(VISITED_KEY, JSON.stringify(next));
  } catch {
    // Storage is optional; the row simply stays unticked.
  }
}

export function FirstProgrammeHome({
  hasChosenBefore,
  accountsConnected,
  programmes,
}: FirstProgrammeHomeProps) {
  const [visited, setVisited] = React.useState<
    Partial<Record<SetupKey, boolean>>
  >({});

  React.useEffect(() => {
    setVisited(readVisited());
  }, []);

  const title = hasChosenBefore
    ? "Choose Your Next Programme"
    : "Choose Your First Programme";

  return (
    <main className="w-full pb-14">
      <div className="mb-5.5 grid gap-5.5 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
        <section
          aria-labelledby="first-programme-title"
          className="relative flex min-h-115 flex-col justify-end overflow-hidden rounded-2xl p-7.5 text-immersive-fg"
        >
          <Image
            alt=""
            aria-hidden
            className="object-cover object-[center_45%]"
            fill
            priority
            sizes="(min-width: 1024px) 760px, 100vw"
            src="/brand/auth-creator-phone.jpg"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-r from-immersive-bg/90 via-immersive-bg/58 via-43% to-immersive-bg/12"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-135 from-accent/22 to-transparent to-52%"
          />
          <div className="relative z-1 max-w-120">
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wide">
              Start here
            </p>
            <h2
              className="text-3xl font-bold leading-snug tracking-tight"
              id="first-programme-title"
            >
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-immersive-fg/82">
              Tell us your goal and we will match you with a programme and a
              daily rhythm.
            </p>
            <Link
              className="mt-6.5 inline-flex h-11.5 items-center gap-2.5 rounded-full bg-accent px-5.5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
              href="/challenge-setup"
            >
              {hasChosenBefore
                ? "Find your next challenge"
                : "Start your first challenge"}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5.5">
          {SETUP_ROWS.map((row) => {
            const done =
              row.key === "connect-accounts"
                ? accountsConnected || Boolean(visited[row.key])
                : Boolean(visited[row.key]);
            const Icon = done ? Check : row.icon;

            return (
              <Link
                className={cn(
                  "group flex min-h-31.5 flex-1 items-center justify-between gap-5.5 rounded-2xl bg-surface px-6.5 py-6 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(0,0,0,0.1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  done && "bg-tint-green-soft",
                )}
                href={row.href}
                key={row.key}
                onClick={() => markVisited(row.key)}
              >
                <span className="min-w-0">
                  <span className="mb-1 block text-2xs font-extrabold uppercase tracking-wide text-muted">
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      "block text-xl font-extrabold tracking-tight text-foreground",
                      done && "text-tint-green dark:text-foreground",
                    )}
                  >
                    {row.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.meta}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-11.5 shrink-0 place-items-center rounded-full bg-background text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground",
                    done && "bg-success text-accent-foreground",
                  )}
                >
                  <Icon className="size-4.5" strokeWidth={done ? 3 : 2} />
                </span>
                {done ? <span className="sr-only">Done</span> : null}
              </Link>
            );
          })}
        </div>
      </div>

      {programmes.length > 0 ? (
        <section aria-labelledby="starter-programmes-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-accent">
                <Sparkles aria-hidden className="size-3.5" />
                Get started
              </p>
              <h2
                className="text-2xl font-extrabold tracking-tight text-foreground"
                id="starter-programmes-title"
              >
                Programmes to get you started
              </h2>
            </div>
            <Link
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
              href="/programs?tab=programmes"
            >
              See all
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5.5 md:grid-cols-3">
            {programmes.map((programme) => (
              <StarterProgrammeCard key={programme.slug} programme={programme} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function StarterProgrammeCard({ programme }: { programme: EligibleProgramme }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative h-42 bg-foreground">
        <Image
          alt=""
          aria-hidden
          className="object-cover"
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          src={coverForProgramme(programme.slug)}
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          {programme.title}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Clock aria-hidden className="size-3.5 opacity-70" />
          {programme.durationLabel}
        </p>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
          {programme.description}
        </p>
        <div className="mt-auto pt-5">
          <Link
            className="flex h-11 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background transition-opacity hover:opacity-90"
            href={`/programs/${encodeURIComponent(programme.slug)}/welcome`}
          >
            View programme
          </Link>
        </div>
      </div>
    </article>
  );
}
