"use client";

import { ArrowRight, CalendarDays, Check, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import { coverForProgramme } from "@/lib/programme-cover";
import type { Programme } from "@/schemas/challenge-setup.schema";

/**
 * Programs › Overview, design direction "Welcome 3": the programme as a hero
 * with where the user is in it, then what to expect, how it works and the
 * intro video, then the badges it can earn.
 */
export function ProgrammeOverview({
  programme,
  progress,
  onSeeTasks,
  achievements,
}: {
  programme: Programme;
  progress: ChallengeProgress;
  onSeeTasks: () => void;
  achievements: ReactNode;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const cover = coverForProgramme(programme.id);
  const video = programme.founderVideo;

  function playIntro() {
    setPlaying(true);
    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex flex-col gap-5.5">
      <section className="relative flex min-h-96 items-end overflow-hidden rounded-4xl bg-immersive-surface">
        <Image alt="" className="object-cover" fill priority sizes="100vw" src={cover} />
        <span aria-hidden className="absolute inset-0 bg-black/50" />

        <div className="relative z-1 grid w-full gap-8 px-8 py-10 md:grid-cols-2 md:px-13 md:py-12">
          <div className="text-immersive-fg">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-immersive-fg">
              Your programme · Active
            </p>
            <h2 className="text-fluid-md font-extrabold leading-heading tracking-tight">
              {programme.title}
            </h2>
            <p className="mt-3.5 max-w-xl text-base leading-normal text-immersive-fg/85">
              {programme.description}
            </p>

            <div className="mt-6.5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-green-soft px-3.5 py-2 text-xs font-extrabold text-tint-green">
                <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
                Joined
              </span>
              <Link
                className="inline-flex min-h-13 items-center gap-2.5 rounded-full bg-accent px-7 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
                href="/dashboard"
              >
                Continue programme
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <button
                className="inline-flex min-h-13 items-center gap-2.5 rounded-full border border-immersive-fg/40 px-5.5 text-sm font-bold text-immersive-fg transition-colors hover:border-immersive-fg"
                onClick={onSeeTasks}
                type="button"
              >
                <CalendarDays aria-hidden className="size-4" />
                See daily tasks
              </button>
            </div>

            <ProgrammeProgress progress={progress} />

            <ul aria-label="Programme facts" className="mt-5.5 flex flex-wrap gap-2">
              {programmeFacts(programme).map((fact) => (
                <li
                  className="rounded-full bg-immersive-fg/12 px-3 py-1.5 text-xs font-semibold text-immersive-fg/85"
                  key={fact}
                >
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          {video ? (
            <div className="hidden place-items-center md:grid">
              <button
                aria-label="Watch the intro video"
                className="group flex flex-col items-center gap-3 text-sm font-bold text-immersive-fg"
                onClick={playIntro}
                type="button"
              >
                <span className="grid size-16 place-items-center rounded-full bg-immersive-fg text-immersive-surface transition-transform group-hover:scale-105">
                  <Play aria-hidden className="ml-0.5 size-6 fill-current" />
                </span>
                Watch the intro
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4.5 lg:grid-cols-3">
        <OverviewCard title="What to expect">
          <ul className="grid gap-2.5">
            {expectations(programme).map((item) => (
              <li className="flex items-start gap-2.75 rounded-2xl bg-background px-4 py-3.5" key={item}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <Check aria-hidden className="size-3" strokeWidth={2.6} />
                </span>
                <span className="text-sm leading-normal text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </OverviewCard>

        <OverviewCard title="How the programme works">
          <ol className="grid gap-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li className="flex gap-3.5" key={step.title}>
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-accent-foreground"
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-normal text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </OverviewCard>

        <OverviewCard title="Intro video">
          <div ref={videoRef}>
            {video ? (
              <IntroVideo
                cover={cover}
                onPlay={() => setPlaying(true)}
                playing={playing}
                title={video.title ?? "Intro video"}
                vimeoId={video.vimeoId}
              />
            ) : (
              <p className="text-sm text-muted">Intro video coming soon.</p>
            )}
          </div>
        </OverviewCard>
      </div>

      {achievements}
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    title: "Daily Challenge Flow",
    body: "Unlock today's challenge, watch a short tutorial, then create and post using the prompt.",
  },
  {
    title: "Win Streaks & Rewards",
    body: "Every completed day builds your streak and moves you closer to the next badge.",
  },
  {
    title: "Reminders & Guidance",
    body: "Daily reminders, templates and tips keep you on track when you get stuck.",
  },
];

function OverviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6">
      <h3 className="mb-4 text-lg font-bold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Where the user is: the day and a bar once it has begun, the start day before. */
function ProgrammeProgress({ progress }: { progress: ChallengeProgress }) {
  if (!progress.hasStarted) {
    const first = progress.days[0];

    return (
      <p className="mt-3.5 text-sm font-semibold text-immersive-fg/75">
        {first ? `Starts ${first.weekdayLabel} ${first.dayOfMonth}` : "Starting soon"} · your
        progress saves automatically.
      </p>
    );
  }

  return (
    <div className="mt-4 max-w-sm">
      <div
        aria-label={`${progress.progressPercent}% complete`}
        className="h-1.5 overflow-hidden rounded-full bg-immersive-fg/20"
        role="img"
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <p className="mt-2 flex justify-between text-xs font-semibold text-immersive-fg/75">
        <span>
          Day {progress.currentDay} of {progress.totalDays}
        </span>
        <span>{progress.progressPercent}% complete</span>
      </p>
    </div>
  );
}

function IntroVideo({
  cover,
  title,
  vimeoId,
  playing,
  onPlay,
}: {
  cover: string;
  title: string;
  vimeoId: string;
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-immersive-surface">
      {playing ? (
        <iframe
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full"
          // oxlint-disable-next-line iframe-missing-sandbox
          sandbox="allow-scripts allow-same-origin allow-presentation"
          src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
          title={title}
        />
      ) : (
        <button
          aria-label={`Play ${title}`}
          className="group absolute inset-0 size-full"
          onClick={onPlay}
          type="button"
        >
          <Image alt="" className="object-cover" fill sizes="(min-width: 1024px) 30vw, 100vw" src={cover} />
          <span aria-hidden className="absolute inset-0 bg-black/35 transition-colors group-hover:bg-black/25" />
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 grid size-14 -translate-1/2 place-items-center rounded-full bg-immersive-fg text-immersive-surface transition-transform group-hover:scale-105"
          >
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
          <span className="absolute bottom-3.5 left-4 text-sm font-bold text-immersive-fg">{title}</span>
        </button>
      )}
    </div>
  );
}

function programmeFacts(programme: Programme): string[] {
  return [
    programme.durationLabel,
    programme.level,
    ...programme.features.slice(0, 2).map((feature) => feature.label),
  ].filter((fact): fact is string => Boolean(fact?.trim()));
}

/** Up to three short points from the authored expectations, else the programme's own facts. */
function expectations(programme: Programme): string[] {
  const body = programme.expectations?.body?.trim();
  const sentences = body
    ? body
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (sentences.length > 0) return sentences;

  const fallback = [
    programme.durationLabel ? `${programme.durationLabel} of short daily tasks` : null,
    ...programme.features.slice(0, 2).map((feature) => feature.label),
  ].filter((item): item is string => Boolean(item));

  return fallback.length > 0 ? fallback : ["Expectations for this programme are being finalised."];
}
