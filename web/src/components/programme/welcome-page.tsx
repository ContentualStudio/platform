"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Birthstone } from "next/font/google";
import { useState } from "react";
import {
  AlertCircle,
  AlignLeft,
  ChevronLeft,
  Clock3,
  Gauge,
  Play,
  RotateCw,
  Target,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  useBeginProgrammeMutation,
  useStartProgrammeMutation,
} from "@/hooks/challenge-setup/use-challenge-setup-mutations";
import {
  ChallengeSetupServiceError,
  getProgrammeWelcome,
  getWelcomeContent,
} from "@/services/challenge-setup.service";
import type {
  Programme,
  ProgrammeStartState,
  ProgrammeWelcome,
} from "@/schemas/challenge-setup.schema";
import type { ReactNode } from "react";
import { coverForProgramme } from "@/lib/programme-cover";
import { cn } from "@/lib/utils";

const birthstone = Birthstone({
  subsets: ["latin"],
  weight: "400",
});

interface WelcomePageProps {
  name: string | null;
  /** A programme chosen from the eligible list. Omitted for the matched programme. */
  slug?: string;
  /** Where the page was opened from, when that place deserves a way back. */
  back?: { href: string; label: string };
}

async function matchedWelcome(): Promise<ProgrammeWelcome> {
  return { programme: await getWelcomeContent(), start: "startable" };
}

export function WelcomePage({ back, name, slug }: WelcomePageProps) {
  const router = useRouter();
  const eyebrow = slug ? "Welcome to your challenge" : "Welcome to your first challenge";

  const content = useQuery({
    queryKey: slug ? ["programme-welcome", slug] : ["welcome-content"],
    queryFn: slug ? () => getProgrammeWelcome(slug) : matchedWelcome,
    retry: 1,
  });

  const begin = useBeginProgrammeMutation();
  const start = useStartProgrammeMutation();
  const mutation = slug ? start : begin;

  function handleBegin() {
    if (content.data?.start !== "startable" || mutation.isPending) {
      return;
    }

    const onSuccess = () => router.replace("/dashboard");

    if (slug) {
      start.mutate(slug, { onSuccess });
    } else {
      begin.mutate(undefined, { onSuccess });
    }
  }

  if (content.isError) {
    return <ContentError onRetry={() => void content.refetch()} />;
  }

  if (!content.data) {
    return <WelcomeSkeleton eyebrow={eyebrow} name={name} />;
  }

  const canBegin = content.data.start === "startable";

  return (
    <main className="flex min-h-dvh w-full flex-col items-center overflow-y-auto bg-background text-foreground">
      <WelcomeHero
        back={back}
        beginError={mutation.isError ? mutation.error : null}
        eyebrow={eyebrow}
        isPending={mutation.isPending}
        name={name}
        onBegin={handleBegin}
        programme={content.data.programme}
        start={content.data.start}
      />

      <WelcomeContent
        canBegin={canBegin}
        isPending={mutation.isPending}
        onBegin={handleBegin}
        programme={content.data.programme}
      />
    </main>
  );
}

function WelcomeHero({
  back,
  beginError,
  eyebrow,
  isPending,
  name,
  onBegin,
  programme,
  start,
}: {
  back?: { href: string; label: string };
  beginError: unknown;
  eyebrow: string;
  isPending: boolean;
  name: string | null;
  onBegin: () => void;
  programme: Programme;
  start: ProgrammeStartState;
}) {
  return (
    <>
      <section className="relative w-full px-6 pt-26 pb-11 text-center">
        {back ? (
          <Link
            className="absolute top-6 left-6 z-3 inline-flex items-center gap-2 text-xs font-bold text-muted transition-colors hover:text-foreground"
            href={back.href}
          >
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2.4} />
            {back.label}
          </Link>
        ) : null}
        <p className="mb-1 text-[15px] font-medium uppercase tracking-[0.04em] text-muted">
          {eyebrow}
          {name ? "," : ""}
        </p>
        {name ? (
          <p
            className={cn(
              birthstone.className,
              "mb-3 text-[42px] leading-none text-[#ff5a1f]",
            )}
          >
            {name}!
          </p>
        ) : null}
        <h1 className="mx-auto mt-1.5 mb-4 max-w-200 text-[clamp(2.75rem,7vw,5.25rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-foreground text-balance">
          {programme.title}
        </h1>
        <p className="mx-auto mb-6.5 max-w-[54ch] text-[17px] leading-relaxed text-muted">
          This challenge is broken down into daily tasks designed to help you
          see results!
        </p>
        {start === "startable" ? (
          <BeginButton isPending={isPending} onClick={onBegin}>
            Get Started
          </BeginButton>
        ) : (
          <StartUnavailable state={start} />
        )}
        {beginError ? <BeginError error={beginError} /> : null}
      </section>

      <section className="w-full max-w-270 px-10 max-md:px-5.5">
        <div className="relative">
          <div className="relative h-[clamp(280px,42vw,460px)] overflow-hidden rounded-[28px] bg-immersive-surface shadow-[0_24px_60px_rgba(0,0,0,0.14)]">
            <Image
              alt=""
              aria-hidden="true"
              className="object-cover"
              fill
              priority
              sizes="(min-width: 1080px) 1000px, 100vw"
              src={coverForProgramme(programme.id)}
            />
          </div>
          <div
            aria-label="Difficulty and experience level"
            className="absolute top-7 left-7 z-2 flex flex-wrap gap-2.5 max-sm:top-4 max-sm:left-4 max-sm:gap-2"
          >
            <HeroChip icon={<Gauge aria-hidden className="size-3.75 text-[#ffb020]" />}>
              {programme.level} difficulty
            </HeroChip>
            <HeroChip icon={<UserRound aria-hidden className="size-3.75" />}>
              {experienceLabel(programme.level)}
            </HeroChip>
          </div>
        </div>
      </section>
    </>
  );
}

function HeroChip({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.75 rounded-full border border-white/18 bg-black/45 px-3.5 py-2 text-[13px] font-semibold tracking-[0.01em] text-white backdrop-blur-md max-sm:px-3 max-sm:py-1.75 max-sm:text-xs">
      {icon}
      {children}
    </span>
  );
}

// The CMS stores a level, not an experience requirement; this is the plain
// reading of each level for someone deciding whether to start.
function experienceLabel(level: string) {
  switch (level.trim().toLowerCase()) {
    case "beginner":
      return "No experience needed";
    case "intermediate":
      return "Some experience helpful";
    case "advanced":
      return "For experienced creators";
    default:
      return "Open to every creator";
  }
}

const HOW_IT_WORKS: { title: string; summary: string; points: string[] }[] = [
  {
    title: "Daily Challenge Flow",
    summary: "A simple daily loop that keeps you creating without overthinking.",
    points: [
      "Unlock today's challenge.",
      "Watch a short 1-2 min tutorial.",
      "Create and post using the prompt or tip.",
      "Mark complete to earn streak points.",
    ],
  },
  {
    title: "Win Streaks & Rewards",
    summary:
      "Consistency compounds - every completed day builds momentum and unlocks rewards.",
    points: [
      "Badges for every completed challenge.",
      "Streak milestones as your run grows.",
      "Exclusive Momentum Badge for staying consistent.",
    ],
  },
  {
    title: "Reminders & Guidance",
    summary: "You won't go it alone - nudges and templates keep you on track.",
    points: [
      "Daily reminders so you never miss a day.",
      "Ready-made templates and content tips.",
      "Helpful guidance whenever you get stuck.",
    ],
  },
];

function WelcomeContent({
  canBegin,
  isPending,
  onBegin,
  programme,
}: {
  canBegin: boolean;
  isPending: boolean;
  onBegin: () => void;
  programme: Programme;
}) {
  return (
    <>
      <section className="mt-10 grid w-full max-w-270 grid-cols-3 gap-4.5 px-10 max-[900px]:grid-cols-1 max-md:px-5.5">
        <FactTile
          body={overviewPurpose(programme)}
          icon={<Target aria-hidden className="size-3.75" />}
          title="Purpose"
        />
        <FactTile
          body={`${programme.durationDays} days, ${programme.durationDays} small wins.`}
          icon={<Clock3 aria-hidden className="size-3.75" />}
          title="Duration"
        />
        <FactTile
          body="Each day unlocks a bite-sized challenge, tutorial, and tip to help you improve and post consistently."
          icon={<AlignLeft aria-hidden className="size-3.75" />}
          title="Format"
        />
      </section>

      <section
        aria-label="How it works"
        className="mt-14 grid w-full max-w-270 grid-cols-2 gap-x-12 gap-y-7.5 px-10 max-[900px]:grid-cols-1 max-md:px-5.5"
      >
        {HOW_IT_WORKS.map((step, index) => (
          <article className="grid grid-cols-[44px_1fr] gap-4.5" key={step.title}>
            <span className="grid size-11 place-items-center rounded-full border border-border bg-background font-extrabold text-accent">
              {index + 1}
            </span>
            <div>
              <h2 className="mt-1 mb-1.5 text-[17px] font-bold text-foreground">
                {step.title}
              </h2>
              <p className="mb-2.5 text-[15px] leading-relaxed text-muted">
                {step.summary}
              </p>
              <ul className="flex flex-col gap-2">
                {step.points.map((point) => (
                  <li
                    className="relative pl-5 text-[15px] leading-normal text-muted before:absolute before:top-1.75 before:left-0.5 before:size-1.5 before:rounded-full before:bg-accent"
                    key={point}
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      {programme.founderVideo ? (
        <FounderVideo
          cover={coverForProgramme(programme.id)}
          title={programme.founderVideo.title ?? "Founder video"}
          vimeoId={programme.founderVideo.vimeoId}
        />
      ) : null}

      <section className="w-full px-6 pt-20 pb-24 text-center">
        <h2 className="mb-5.5 text-[clamp(1.875rem,4vw,3rem)] font-extrabold tracking-[-0.03em] text-foreground">
          Start your programme
        </h2>
        {canBegin ? (
          <BeginButton isPending={isPending} onClick={onBegin}>
            Get Started
          </BeginButton>
        ) : null}
      </section>
    </>
  );
}

function FactTile({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6.5">
      <h2 className="inline-flex items-center gap-1.75 text-xs font-extrabold uppercase tracking-[0.08em] text-accent">
        {icon}
        {title}
      </h2>
      <p className="mt-2.5 text-[15px] leading-normal text-foreground">{body}</p>
    </article>
  );
}

// The thumbnail stands in for the player until asked for, so the page does not
// pay for a Vimeo embed nobody presses play on.
function FounderVideo({
  cover,
  title,
  vimeoId,
}: {
  cover: string;
  title: string;
  vimeoId: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="mt-14 w-full max-w-270 px-10 max-md:px-5.5">
      <h2 className="mb-4.5 text-[clamp(1.375rem,3vw,2rem)] font-extrabold tracking-[-0.02em] text-foreground">
        Watch our breakdown video to get started!
      </h2>
      <div className="relative h-[clamp(240px,34vw,420px)] overflow-hidden rounded-[28px] bg-immersive-surface shadow-[0_24px_60px_rgba(0,0,0,0.14)]">
        {playing ? (
          <iframe
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            // oxlint-disable-next-line iframe-missing-sandbox
            sandbox="allow-scripts allow-same-origin allow-presentation"
            className="absolute inset-0 size-full"
            src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
            title={title}
          />
        ) : (
          <button
            aria-label="Play breakdown video"
            className="group absolute inset-0 size-full cursor-pointer"
            onClick={() => setPlaying(true)}
            type="button"
          >
            <Image
              alt=""
              aria-hidden="true"
              className="object-cover"
              fill
              sizes="(min-width: 1080px) 1000px, 100vw"
              src={cover}
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-black/35 transition-colors group-hover:bg-black/22"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 z-1 grid size-18 -translate-1/2 place-items-center rounded-full bg-white/92 text-[#111] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-106"
            >
              <Play className="ml-0.5 size-6.5 fill-current" />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

function overviewPurpose(programme: Programme) {
  const focus = programme.snapshot?.find((item) => item.label === "Focus")?.value;
  if (focus) {
    return `This challenge helps you ${focus.toLowerCase()}.`;
  }

  if (programme.expectations?.body) {
    return firstSentence(programme.expectations.body);
  }

  return firstSentence(programme.description);
}

function firstSentence(text: string) {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match?.[0]?.trim() ?? text;
}

function BeginButton({
  children,
  isPending,
  onClick,
}: {
  children: ReactNode;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-0 items-center justify-center gap-2 rounded-full bg-[#ff5a1f] px-13 py-4 text-[17px] font-semibold text-white shadow-[0_8px_24px_rgb(255_90_31/0.3)] transition hover:-translate-y-0.5 hover:bg-[#e04e15] hover:shadow-[0_12px_32px_rgb(255_90_31/0.4)] disabled:pointer-events-none disabled:opacity-40"
      disabled={isPending}
      onClick={onClick}
      type="button"
    >
      {isPending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </button>
  );
}

const START_UNAVAILABLE: Record<
  Exclude<ProgrammeStartState, "startable">,
  { message: string; href: string; action: string }
> = {
  active: {
    message: "You're already on this programme.",
    href: "/programs",
    action: "Go to your programme",
  },
  another_active: {
    message: "Finish your current programme before starting this one.",
    href: "/programs",
    action: "View current programme",
  },
  setup_incomplete: {
    message: "Finish your setup to start a programme.",
    href: "/challenge-setup",
    action: "Continue setup",
  },
  locked: {
    message: "This programme hasn't been unlocked for you yet.",
    href: "/programs/available",
    action: "Back to programmes",
  },
  requires_upgrade: {
    message: "This programme is part of a paid plan.",
    href: "/settings/account",
    action: "See plans",
  },
};

function StartUnavailable({
  state,
}: {
  state: Exclude<ProgrammeStartState, "startable">;
}) {
  const { message, href, action } = START_UNAVAILABLE[state];

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-[15px] text-immersive-fg/80">{message}</p>
      <Link
        className="inline-flex items-center justify-center rounded-full bg-[#ff5a1f] px-10 py-3.5 text-[16px] font-semibold text-white transition hover:bg-[#e04e15]"
        href={href}
      >
        {action}
      </Link>
    </div>
  );
}

// Refusals the member can understand and act on; anything else is a retry.
const EXPLAINED_START_ERRORS = new Set([
  "PROGRAMME_ALREADY_ACTIVE",
  "PROGRAMME_LOCKED",
  "PROGRAMME_NOT_AVAILABLE",
  "SETUP_INCOMPLETE",
]);

function BeginError({ error }: { error: unknown }) {
  const code = error instanceof ChallengeSetupServiceError ? error.code : null;

  if (code && EXPLAINED_START_ERRORS.has(code)) {
    return (
      <p className="mt-4 text-center text-sm text-destructive">{(error as Error).message}</p>
    );
  }

  if (code === "PROGRAMME_REQUIRES_UPGRADE") {
    return (
      <p className="mt-4 text-center text-sm text-destructive">
        {(error as Error).message}{" "}
        <Link className="font-semibold underline" href="/settings/account">
          See plans
        </Link>
      </p>
    );
  }

  return (
    <p className="mt-4 text-center text-sm text-destructive">
      Couldn&apos;t begin the programme. Please try again.
    </p>
  );
}

function WelcomeSkeleton({ eyebrow, name }: { eyebrow: string; name: string | null }) {
  return (
    <main className="flex min-h-dvh w-full animate-pulse flex-col items-center overflow-hidden bg-background">
      <section className="w-full px-6 pt-26 pb-11 text-center">
        <p className="mb-1 text-[15px] uppercase tracking-[0.04em] text-muted">
          {eyebrow}
          {name ? "," : ""}
        </p>
        {name ? (
          <p
            className={cn(
              birthstone.className,
              "mb-3 text-[42px] leading-none text-[#ff5a1f]",
            )}
          >
            {name}!
          </p>
        ) : null}
        <div className="mx-auto mb-4 h-20 w-full max-w-160 rounded-4xl bg-surface" />
        <div className="mx-auto mb-6.5 h-6 w-full max-w-90 rounded-2xl bg-surface" />
        <div className="mx-auto h-14 w-44 rounded-full bg-surface" />
      </section>
      <div className="w-full max-w-270 px-10 max-md:px-5.5">
        <div className="h-[clamp(280px,42vw,460px)] rounded-[28px] bg-surface" />
      </div>
      <div className="mt-10 grid w-full max-w-270 grid-cols-3 gap-4.5 px-10 max-[900px]:grid-cols-1 max-md:px-5.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="h-32 rounded-[24px] bg-surface" key={index} />
        ))}
      </div>
    </main>
  );
}

function ContentError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-140 flex-col items-center gap-4 rounded-2xl bg-surface p-10 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">
            We couldn&apos;t load your programme
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and try again.
          </p>
        </div>
        <Button onClick={onRetry} variant="outline">
          <RotateCw className="size-4" />
          Retry
        </Button>
      </div>
    </main>
  );
}
