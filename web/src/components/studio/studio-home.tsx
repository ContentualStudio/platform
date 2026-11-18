"use client";

import * as React from "react";
import { Check, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { StudioLessonSummary } from "@/lib/server-studio-lessons";
import {
  forYouSectionCopy,
  selectForYouLessons,
  toStudioLessonCard,
  type StudioLessonCardModel,
} from "@/lib/studio";
import {
  LessonDialog,
  StudioEmptyPanel,
  StudioLessonCard,
  StudioPrimaryButton,
  StudioSecondaryButton,
  studioPrimaryButtonClass,
} from "@/components/studio/studio-lesson-card";

interface StudioHomeProps {
  currentDay: number;
  /** Lesson to open on arrival — the daily task card's Studio link. */
  initialLessonId?: string | null;
  lessons: StudioLessonSummary[];
  platformLabel: string;
  /** Mirror document id of the current programme; null between programmes. */
  programmeId: string | null;
  programmeTitle: string | null;
  progressPercent: number;
  totalDays: number;
}

export function StudioHome({
  currentDay,
  initialLessonId = null,
  lessons,
  platformLabel,
  programmeId,
  programmeTitle,
  progressPercent,
  totalDays,
}: StudioHomeProps) {
  const [dismissedInitial, setDismissedInitial] = React.useState<string | null>(
    null,
  );
  const [selectedLesson, setSelectedLesson] =
    React.useState<StudioLessonCardModel | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false);

  React.useEffect(() => {
    setNudgeDismissed(
      window.localStorage.getItem("studio-inline-nudge-dismissed-v1") === "1",
    );
  }, []);

  const cards = lessons.map((lesson) =>
    toStudioLessonCard(lesson, { platformLabel }),
  );
  const selection = selectForYouLessons(cards, { programmeId, currentDay });

  const copy = forYouSectionCopy(selection, { currentDay, programmeTitle });

  const forYouLessons = selection.kind === "none" ? [] : selection.lessons;
  // The programme banner sits above the For-you grid and must not claim
  // matches the grid is about to say do not exist.
  const hasContextualLessons = selection.kind === "contextual";

  function dismissNudge() {
    setNudgeDismissed(true);
    window.localStorage.setItem("studio-inline-nudge-dismissed-v1", "1");
  }

  return (
    <div className="w-full pb-24">
      <header className="mb-[38px] flex flex-wrap items-end justify-between gap-7">
        <div>
          {/* The app header renders this route's <h1>; repeating it here gave
              the page two h1s and printed "Studio" twice. */}
          <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-accent">
            Creator learning library
          </p>
          <p className="max-w-[660px] text-base leading-[1.65] text-muted">
            Learn what you need for the work in front of you, then return to the
            full library whenever you want to go deeper.
          </p>
        </div>
        <Link className={studioPrimaryButtonClass} href="/studio/browse">
          Browse all lessons
        </Link>
      </header>

      {programmeTitle ? (
        <section
          aria-label="Current programme context"
          className="relative mb-[42px] grid items-center gap-8 overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#fff0e9_0%,#fff8f4_58%,#fff_100%)] p-8 min-[900px]:grid-cols-[1.4fr_0.6fr] dark:bg-[linear-gradient(135deg,#3d1b0f,#271713_68%,#202020)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-21 -top-28 size-[300px] rounded-full bg-accent/10"
          />
          <div className="relative z-1">
            <p className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#ad1d07] dark:text-[#ffad86]">
              <span className="size-2 rounded-full bg-accent" />
              {hasContextualLessons
                ? "Matched to your programme"
                : "Your current programme"}
            </p>
            {hasContextualLessons ? (
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-[#8d2d0e] shadow-[0_5px_16px_rgba(124,48,15,0.08)] dark:bg-white/10 dark:text-[#ffbf9e]">
                <Check aria-hidden className="size-3.5 text-accent" />
                {platformLabel} lesson variant selected
              </span>
            ) : null}
            <h2 className="max-w-[620px] text-[28px] leading-[1.18] tracking-[-0.025em] text-[#111] dark:text-white">
              {currentDay > 0
                ? `${hasContextualLessons ? "Lessons for " : ""}Day ${currentDay} of ${programmeTitle}`
                : programmeTitle}
            </h2>
            <p className="mt-2.5 max-w-[650px] leading-relaxed text-[#6f5146] dark:text-[#c4a79c]">
              {hasContextualLessons
                ? `These lessons match your active programme and ${platformLabel} focus. Open one when you need guidance for today's work.`
                : currentDay > 0
                  ? "Your programme is running. Browse the library while recommendations for your programme are prepared."
                  : "Your programme is ready. Explore the library before day 1 begins."}
            </p>
          </div>
          <aside className="relative z-1 w-full max-w-[270px] justify-self-end rounded-[22px] bg-white/78 p-5 shadow-[0_12px_34px_rgba(124,48,15,0.08)] backdrop-blur-md dark:bg-white/7">
            <div className="flex items-center justify-between gap-3 text-[13px] text-[#8f6657] dark:text-[#c4a79c]">
              <span>Programme progress</span>
              <strong className="text-[#111] dark:text-white">
                {currentDay > 0
                  ? `Day ${currentDay} of ${totalDays}`
                  : `Day 1 of ${totalDays}`}
              </strong>
            </div>
            <div
              aria-label={`${progressPercent} percent complete`}
              className="my-3.5 h-1.5 overflow-hidden rounded-full bg-[#f3d7ca] dark:bg-[#5c3427]"
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <Link
              className="text-[13px] font-bold text-foreground underline underline-offset-4"
              href="/programs?tab=tasks"
            >
              View today&apos;s tasks
            </Link>
          </aside>
        </section>
      ) : null}

      <section aria-labelledby="studio-for-you-title" className="mt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2
              className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] text-foreground"
              id="studio-for-you-title"
            >
              {copy.heading}
            </h2>
            <p className="mt-1.5 text-sm leading-normal text-muted">
              {copy.subcopy}
            </p>
          </div>
          <Link
            className="text-sm font-bold text-foreground underline underline-offset-4"
            href="/studio/browse"
          >
            See the full library →
          </Link>
        </div>

        {forYouLessons.length > 0 ? (
          <div className="grid gap-[22px] min-[900px]:grid-cols-3">
            {forYouLessons.map((lesson) => (
              <StudioLessonCard
                key={lesson.id}
                lesson={lesson}
                onOpen={setSelectedLesson}
              />
            ))}
          </div>
        ) : selection.kind === "none" ? (
          <StudioEmptyPanel
            action={
              <Link className={studioPrimaryButtonClass} href="/studio/browse">
                Browse all lessons
              </Link>
            }
          />
        ) : (
          <StudioEmptyPanel message="Lessons will appear here once programme content is published." />
        )}
      </section>

      {!nudgeDismissed && forYouLessons[0] ? (
        <aside
          aria-label="Related lesson suggestion"
          className="mt-[30px] flex flex-col gap-4 rounded-3xl bg-surface p-5 min-[760px]:flex-row min-[760px]:items-center"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e9] text-accent dark:bg-[#4a2114]">
            <Lightbulb aria-hidden className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block text-[15px] text-foreground">
              Go deeper after today&apos;s task
            </strong>
            <span className="mt-1 block text-[13px] leading-snug text-muted">
              Finished today&apos;s work? Open{" "}
              <span className="font-semibold text-foreground">
                {forYouLessons[0].title}
              </span>{" "}
              to sharpen it without losing your voice.
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <StudioPrimaryButton
              onClick={() => setSelectedLesson(forYouLessons[0])}
              type="button"
            >
              Open lesson
            </StudioPrimaryButton>
            <StudioSecondaryButton onClick={dismissNudge} type="button">
              Dismiss
            </StudioSecondaryButton>
          </div>
        </aside>
      ) : null}

      <LessonDialog
        lesson={selectedLesson}
        initialLessonId={
          dismissedInitial === initialLessonId ? null : initialLessonId
        }
        onClose={() => {
          setSelectedLesson(null);
          setDismissedInitial(initialLessonId);
        }}
      />
    </div>
  );
}
