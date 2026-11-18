"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Gauge, Sparkles, Star } from "lucide-react";
import Image from "next/image";
import { CeeMascot } from "@/components/brand/cee-mascot";
import { ProgrammeFeatureIcon } from "@/components/challenge-setup/programme-feature-icon";
import { coverForProgramme } from "@/lib/programme-cover";
import { cn } from "@/lib/utils";
import { getEligibleProgrammes } from "@/services/challenge-setup.service";
import type { Programme } from "@/schemas/challenge-setup.schema";
import type { EligibleProgramme } from "@/schemas/eligible-programme.schema";

interface RecommendationScreenProps {
  programme: Programme;
  /** Continue with the matched programme. */
  onContinue: () => void;
  /** Continue with an alternative the user brought into focus instead. */
  onChooseAlternative: (slug: string) => void;
}

type Slide =
  | { kind: "matched"; key: string; programme: Programme }
  | { kind: "alternative"; key: string; programme: EligibleProgramme };

// Two either side of the match is the most the selector shows at once; more
// would turn a recommendation back into a catalogue.
const MAX_ALTERNATIVES = 4;

export function RecommendationScreen({
  programme,
  onContinue,
  onChooseAlternative,
}: RecommendationScreenProps) {
  const eligible = useQuery({
    queryKey: ["eligible-programmes"],
    queryFn: getEligibleProgrammes,
    retry: 1,
  });

  const slides = React.useMemo<Slide[]>(() => {
    const alternatives = (eligible.data ?? [])
      .filter(
        (row) =>
          !row.locked &&
          !row.requiresUpgrade &&
          row.slug !== programme.id &&
          row.title !== programme.title,
      )
      .slice(0, MAX_ALTERNATIVES)
      .map<Slide>((row) => ({ kind: "alternative", key: row.slug, programme: row }));

    // The match sits in the middle so it opens in focus with one alternative
    // either side.
    const before = alternatives.slice(0, Math.ceil(alternatives.length / 2));
    const after = alternatives.slice(Math.ceil(alternatives.length / 2));

    return [
      ...before,
      { kind: "matched", key: programme.id, programme },
      ...after,
    ];
  }, [eligible.data, programme]);

  const matchedIndex = slides.findIndex((slide) => slide.kind === "matched");
  const [active, setActive] = React.useState(matchedIndex);

  React.useEffect(() => {
    setActive(matchedIndex);
  }, [matchedIndex]);

  const count = slides.length;
  const focused = slides[active] ?? slides[matchedIndex];
  const step = (delta: number) =>
    setActive((current) => (current + delta + count) % count);

  function handleContinue() {
    if (focused.kind === "matched") {
      onContinue();
    } else {
      onChooseAlternative(focused.programme.slug);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-290 flex-col items-center px-6 py-10">
      <div aria-hidden className="relative mb-3.5 size-28">
        <CeeMascot className="absolute inset-3" expression="idle" size={88} />
      </div>

      <h2 className="max-w-180 text-center text-4xl font-extrabold leading-heading tracking-tight text-foreground text-balance">
        Here are some suggested challenges for you based on your unique profile
      </h2>

      <section
        aria-label="Suggested programmes"
        aria-roledescription="carousel"
        className="relative mt-8 w-full"
      >
        <div className="relative h-122 overflow-hidden py-7.5 max-[820px]:h-114">
          {slides.map((slide, index) => {
            const offset = circularOffset(index, active, count);
            const isActive = offset === 0;
            const isSide = Math.abs(offset) === 1;

            return (
              <div
                aria-hidden={!isActive}
                aria-roledescription="slide"
                className={cn(
                  "absolute top-7.5 left-1/2 w-[min(380px,78vw)] transition-[transform,opacity] duration-[650ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none",
                  isActive && "z-2",
                  isSide && "z-1 cursor-pointer opacity-72 hover:opacity-100",
                  !isActive && !isSide && "pointer-events-none opacity-0",
                )}
                key={slide.key}
                style={{
                  transform: `translateX(calc(-50% + ${offset * 104}%)) scale(${isActive ? 1 : 0.92})`,
                }}
              >
                <ProgrammeSlideCard active={isActive} slide={slide} />
                {/* A pointer shortcut only: the arrows and dots are the
                    keyboard path, so this stays out of the tab order. */}
                {isSide ? (
                  <button
                    aria-label={`Show ${slide.programme.title}`}
                    className="absolute inset-0 z-1 rounded-xl"
                    onClick={() => setActive(index)}
                    tabIndex={-1}
                    type="button"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {count > 1 ? (
          <>
            <CarouselArrow direction="previous" onClick={() => step(-1)} />
            <CarouselArrow direction="next" onClick={() => step(1)} />
            <div className="mt-4 flex min-h-2 items-center justify-center gap-2">
              {slides.map((slide, index) => (
                <button
                  aria-label={`Show ${slide.programme.title}`}
                  aria-pressed={index === active}
                  className={cn(
                    "h-2 w-2 rounded-full bg-border transition-[width,background-color] duration-300 hover:bg-muted",
                    index === active && "w-6 bg-accent hover:bg-accent",
                  )}
                  key={slide.key}
                  onClick={() => setActive(index)}
                  type="button"
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <button
        className="mt-8 flex h-15 w-full max-w-175 items-center justify-center rounded-full bg-foreground text-lg font-semibold text-background transition hover:opacity-90"
        onClick={handleContinue}
        type="button"
      >
        Get Started
      </button>
    </div>
  );
}

/** Shortest signed distance from the active slide, wrapping round the ends. */
function circularOffset(index: number, active: number, count: number) {
  let offset = index - active;
  if (offset > count / 2) offset -= count;
  if (offset < -count / 2) offset += count;
  return offset;
}

function CarouselArrow({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;

  return (
    <button
      aria-label={direction === "previous" ? "Previous programme" : "Next programme"}
      className={cn(
        "absolute top-1/2 z-3 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-foreground shadow-soft transition-colors hover:bg-accent hover:text-white max-sm:hidden",
        direction === "previous" ? "left-0" : "right-0",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

function ProgrammeSlideCard({ active, slide }: { active: boolean; slide: Slide }) {
  const isMatched = slide.kind === "matched";
  const cover = coverForProgramme(
    isMatched ? slide.programme.id : slide.programme.slug,
  );

  return (
    <article
      className={cn(
        "flex h-108 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_8px_20px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] duration-300 dark:bg-surface",
        active &&
          "border-accent/55 shadow-[0_14px_34px_rgba(0,0,0,0.13)]",
      )}
    >
      <div className="relative h-40 shrink-0 bg-foreground">
        <Image
          alt=""
          aria-hidden
          className="object-cover"
          fill
          sizes="380px"
          src={cover}
        />
        {isMatched ? (
          <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-2xs font-extrabold uppercase tracking-wide text-white">
            <Sparkles aria-hidden className="size-3" />
            Best match
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-5 py-4.5">
        <h3 className="mb-1.5 text-lg font-bold leading-normal tracking-tight text-foreground">
          {slide.programme.title}
        </h3>
        <p className="mb-3 line-clamp-3 text-sm leading-normal text-muted">
          {slide.programme.description}
        </p>

        {isMatched && slide.programme.features.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            {slide.programme.features.slice(0, 3).map((feature) => (
              <div className="flex items-center gap-2.5" key={feature.label}>
                <ProgrammeFeatureIcon
                  className="size-4 shrink-0 text-foreground opacity-50"
                  icon={feature.icon}
                />
                <span className="text-xs text-foreground">{feature.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="size-3.5 opacity-60" />
              {slide.programme.durationLabel}
            </span>
            {isMatched ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Gauge aria-hidden className="size-3.5 opacity-60" />
                  {slide.programme.level}
                </span>
                <span
                  aria-label={`Difficulty ${slide.programme.difficulty} of 5`}
                  className="inline-flex items-center gap-0.5"
                  role="img"
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      aria-hidden
                      className={cn(
                        "size-3",
                        index < slide.programme.difficulty
                          ? "fill-foreground text-foreground"
                          : "text-border",
                      )}
                      key={index}
                    />
                  ))}
                </span>
              </>
            ) : slide.programme.track ? (
              <span className="text-muted">{slide.programme.track}</span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
