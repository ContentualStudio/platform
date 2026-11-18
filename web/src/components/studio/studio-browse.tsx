"use client";

import * as React from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { StudioLessonSummary } from "@/lib/server-studio-lessons";
import {
  activeStudioPlatformOptions,
  defaultStudioFilters,
  filterStudioLessons,
  parseStudioFilters,
  studioBrowseHref,
  studioFiltersActive,
  toStudioLessonCard,
  type StudioFilters,
  type StudioLessonCardModel,
} from "@/lib/studio";
import { cn } from "@/lib/utils";
import {
  LessonDialog,
  StudioFilterField,
  StudioLessonCard,
  StudioPrimaryButton,
} from "@/components/studio/studio-lesson-card";

const NO_RELATED_LESSONS: string[] = [];

interface StudioBrowseProps {
  /** Lesson to open on arrival — the daily task card's Studio link. */
  initialLessonId?: string | null;
  relatedLessonIds?: string[];
  lessons: StudioLessonSummary[];
  platformLabel: string;
}

export function StudioBrowse({
  initialLessonId = null,
  relatedLessonIds = NO_RELATED_LESSONS,
  lessons,
  platformLabel,
}: StudioBrowseProps) {
  const searchParams = useSearchParams();
  // Parsed once from the arriving URL; afterwards every change writes the URL
  // back, so state and address stay in sync without stacking history entries.
  const [initial] = React.useState(() => parseStudioFilters(searchParams));

  const [filters, setFilters] = React.useState<StudioFilters>(initial.filters);
  const [query, setQuery] = React.useState(initial.query);
  const [dismissedInitial, setDismissedInitial] = React.useState<string | null>(
    null,
  );
  const [selectedLesson, setSelectedLesson] =
    React.useState<StudioLessonCardModel | null>(null);

  const cards = lessons.map((lesson) =>
    toStudioLessonCard(lesson, { platformLabel }),
  );

  // The grid renders from local state, so the URL is only the shareable record
  // of it. `router.replace` would re-run this cookie-scoped, uncached route on
  // the server — refetching the whole library — to update a query string
  // nothing here reads back. history.replaceState is the shallow update this
  // actually wants: same shareable link, no network.
  const urlSynced = React.useRef(false);

  React.useEffect(() => {
    // The arriving URL already describes this state; rewriting it on mount
    // would replace the entry the user just navigated to.
    if (!urlSynced.current) {
      urlSynced.current = true;
      return;
    }

    window.history.replaceState(
      null,
      "",
      studioBrowseHref(filters, query, initialLessonId, relatedLessonIds),
    );
  }, [filters, query, initialLessonId, relatedLessonIds]);

  function resetAll() {
    setFilters(defaultStudioFilters);
    setQuery("");
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCards = filterStudioLessons(cards, filters).filter((card) => {
    if (!normalizedQuery) {
      return true;
    }

    const haystack =
      `${card.title} ${card.summary} ${card.formatLabel}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <div className="w-full pb-24">
      <Link
        className="mb-7 inline-flex items-center gap-2 text-[13px] font-bold text-muted transition-colors hover:text-foreground"
        href="/studio"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Studio home
      </Link>

      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-accent">
            {relatedLessonIds.length ? "Related lessons" : "Full library"}
          </p>
          <p className="text-muted">
            {relatedLessonIds.length
              ? "Go deeper into the skill behind your task."
              : "Explore every lesson published for your programme."}
          </p>
        </div>
        <p className="text-[13px] font-bold text-muted">
          {filteredCards.length}{" "}
          {filteredCards.length === 1 ? "lesson" : "lessons"}
        </p>
      </div>

      <div
        aria-label="Filter Studio lessons"
        className="mb-7 grid gap-3 rounded-[22px] bg-surface p-[18px] min-[980px]:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <StudioFilterField
          id="studio-format-filter"
          label="Format"
          onChange={(value) =>
            setFilters({
              ...filters,
              format: value as StudioFilters["format"],
            })
          }
          options={[
            { label: "All formats", value: "all" },
            { label: "Article", value: "article" },
            { label: "Video", value: "video" },
            { label: "Masterclass", value: "masterclass" },
            { label: "Template", value: "template" },
          ]}
          value={filters.format}
        />
        <StudioFilterField
          id="studio-level-filter"
          label="Skill level"
          onChange={(value) =>
            setFilters({
              ...filters,
              level: value as StudioFilters["level"],
            })
          }
          options={[
            { label: "All levels", value: "all" },
            { label: "Beginner", value: "beginner" },
            { label: "Intermediate", value: "intermediate" },
            { label: "Advanced", value: "advanced" },
          ]}
          value={filters.level}
        />
        <StudioFilterField
          id="studio-platform-filter"
          label="Platform"
          onChange={(value) =>
            setFilters({
              ...filters,
              platform: value,
            })
          }
          options={[
            { label: "All platforms", value: "all" },
            ...activeStudioPlatformOptions.map((platform) => ({
              label: platform.label,
              value: platform.value,
            })),
          ]}
          value={filters.platform}
        />
        <StudioFilterField
          id="studio-topic-filter"
          label="Topic"
          onChange={(value) =>
            setFilters({
              ...filters,
              topic: value as StudioFilters["topic"],
            })
          }
          options={[
            { label: "All topics", value: "all" },
            { label: "Video", value: "video" },
            { label: "Photo", value: "photo" },
            { label: "Caption", value: "caption" },
            { label: "Story", value: "story" },
          ]}
          value={filters.topic}
        />
        <button
          className={cn(
            "inline-flex h-11 items-center justify-center gap-1.5 self-end rounded-xl px-3.5 text-xs font-bold text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            studioFiltersActive(filters) &&
              "text-accent hover:bg-background hover:text-foreground",
          )}
          disabled={!studioFiltersActive(filters)}
          onClick={resetAll}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
          Clear filters
        </button>
      </div>

      <div className="relative mb-5 max-w-xl">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          aria-label="Search lessons"
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-[3px] focus:ring-accent/15"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search lessons"
          value={query}
        />
      </div>

      {filteredCards.length > 0 ? (
        <div className="grid gap-[22px] min-[900px]:grid-cols-3">
          {filteredCards.map((lesson) => (
            <StudioLessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={setSelectedLesson}
            />
          ))}
        </div>
      ) : (
        <StudioBrowseEmpty onReset={resetAll} />
      )}

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

function StudioBrowseEmpty({ onReset }: { onReset: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[22px] bg-[#fff0e9] text-accent dark:bg-[#4a2114]">
        <Search aria-hidden className="size-7" />
      </div>
      <h3 className="mb-2 text-[22px] font-bold text-foreground">
        No lessons match those filters
      </h3>
      <p className="mb-5 leading-relaxed text-muted">
        Try broadening your selection or reset the filters to see the complete
        Studio library.
      </p>
      <StudioPrimaryButton onClick={onReset} type="button">
        Reset filters
      </StudioPrimaryButton>
    </div>
  );
}
