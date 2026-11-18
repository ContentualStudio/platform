import type { StudioLessonSummary } from "@/lib/server-studio-lessons";
import type { BillingTierKey } from "@/schemas/billing.schema";

export type StudioLessonFormat = "article" | "video" | "masterclass" | "template";

export type StudioFilters = {
  format: "all" | StudioLessonFormat;
  level: "all" | "beginner" | "intermediate" | "advanced";
  platform: "all" | string;
  topic: "all" | "video" | "photo" | "caption" | "story";
};

export const defaultStudioFilters: StudioFilters = {
  format: "all",
  level: "all",
  platform: "all",
  topic: "all",
};

// Mirrors `lessonPlatformOptions` in `cms/src/collections/content-validation.ts`
// value-for-value (a drift test in `studio.test.ts` enforces it). A coming-soon
// platform can be tagged in the CMS but must never appear here as a filter
// until its status flips to "active".
export const studioPlatformOptions = [
  { value: "instagram", label: "Instagram", status: "active" },
  { value: "youtube", label: "YouTube (coming soon)", status: "coming_soon" },
  { value: "tiktok", label: "TikTok (coming soon)", status: "coming_soon" },
  { value: "linkedin", label: "LinkedIn (coming soon)", status: "coming_soon" },
] as const;

export const activeStudioPlatformOptions = studioPlatformOptions.filter(
  (platform) => platform.status === "active",
);

export const activeStudioPlatforms = activeStudioPlatformOptions.map(
  (platform) => platform.value,
);

export interface StudioLessonCardModel {
  durationLabel: string;
  format: StudioLessonFormat;
  formatLabel: string;
  id: string;
  image: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  /** Body withheld on the user's plan; the card still shows and opens. */
  locked: boolean;
  minimumTier: BillingTierKey;
  /**
   * Set by the home on a contextual For-you pick — the lesson's programme and
   * day range cover where the user is now. Browse never sets it: outside that
   * section there is no context to match against.
   */
  matched: boolean;
  /** Authored platform tags; display uses platformLabel, filtering reads this. */
  platforms: string[];
  /** CMS programme document ids this lesson is relevant to. */
  programmeRelevance: string[];
  programmeDayStart: number | null;
  programmeDayEnd: number | null;
  platformLabel: string;
  summary: string;
  title: string;
  topicLabel: string;
}

const STUDIO_THUMBS = [
  "/brand/auth/creator-phone.jpg",
  "/brand/auth/creator-camera.jpg",
  "/brand/auth/creator-skate.jpg",
] as const;

const lessonFormats: readonly StudioLessonFormat[] = [
  "article",
  "video",
  "masterclass",
  "template",
];

const levelLabels: Record<string, StudioLessonCardModel["level"]> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** "one of this closed vocabulary, else the default" — the shape every filter
 * and every authored-tag read in this file needs. */
function oneOfOr<T extends string>(
  raw: string | null,
  allowed: readonly string[],
  fallback: T,
): T {
  return raw !== null && allowed.includes(raw) ? (raw as T) : fallback;
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

export function studioFormatLabel(format: StudioLessonFormat): string {
  switch (format) {
    case "article":
      return "Aa Article";
    case "video":
      return "▶ Video";
    case "masterclass":
      return "▶ Masterclass";
    case "template":
      return "↓ Template";
  }
}

export function studioDurationLabel(
  format: StudioLessonFormat,
  summary: string | null,
): string {
  if (format === "template") {
    return "PDF template";
  }

  if (summary?.match(/\d+\s*min/i)) {
    return summary.match(/\d+\s*min[^.]*/i)?.[0] ?? "Lesson";
  }

  if (format === "article") {
    return "6 min read";
  }

  return format === "masterclass" ? "30 min" : "10 min";
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index) * (index + 1)) % 9973;
  }

  return hash;
}

export function studioLessonThumb(lessonId: string): string {
  return STUDIO_THUMBS[hashString(lessonId) % STUDIO_THUMBS.length];
}

export function toStudioLessonCard(
  lesson: StudioLessonSummary,
  options: {
    platformLabel?: string;
  } = {},
): StudioLessonCardModel {
  const format = oneOfOr<StudioLessonFormat>(
    lesson.lessonType,
    lessonFormats,
    "article",
  );
  const summary =
    lesson.summary?.trim() || "Open this lesson to view the full guidance.";
  const level = levelLabels[lesson.skillLevel ?? ""] ?? "Beginner";
  const topicLabel = lesson.contentType
    ? capitalize(lesson.contentType)
    : "Foundation";
  const platformLabel =
    lesson.platforms.length > 0
      ? capitalize(lesson.platforms[0])
      : (options.platformLabel ?? "Instagram");

  return {
    durationLabel: studioDurationLabel(format, lesson.summary),
    format,
    formatLabel: studioFormatLabel(format),
    id: lesson.id,
    image: studioLessonThumb(lesson.id),
    level,
    locked: lesson.locked,
    minimumTier: lesson.minimumTier,
    matched: false,
    platforms: lesson.platforms,
    programmeRelevance: lesson.programmeRelevance,
    programmeDayStart: lesson.programmeDayStart,
    programmeDayEnd: lesson.programmeDayEnd,
    platformLabel,
    summary,
    title: lesson.title,
    topicLabel,
  };
}

export function filterStudioLessons(
  cards: StudioLessonCardModel[],
  filters: StudioFilters,
): StudioLessonCardModel[] {
  return cards.filter((card) => {
    if (filters.format !== "all" && card.format !== filters.format) {
      return false;
    }

    if (
      filters.level !== "all" &&
      card.level.toLowerCase() !== filters.level
    ) {
      return false;
    }

    if (filters.platform !== "all") {
      const wanted = filters.platform.toLowerCase();
      const tagged = card.platforms.some(
        (platform) => platform.toLowerCase() === wanted,
      );
      // Pre-backfill rows carry no tags and cannot be classified; they stay
      // visible under every platform filter rather than vanishing from the
      // library. Run the content-sync backfill promptly after deploy.
      if (!tagged && card.platforms.length > 0) {
        return false;
      }
    }

    if (
      filters.topic !== "all" &&
      card.topicLabel.toLowerCase() !== filters.topic
    ) {
      return false;
    }

    return true;
  });
}

export function studioFiltersActive(filters: StudioFilters): boolean {
  return Object.values(filters).some((value) => value !== "all");
}

const studioLevels = ["beginner", "intermediate", "advanced"] as const;
const studioTopics = ["video", "photo", "caption", "story"] as const;
const allStudioPlatforms = studioPlatformOptions.map((platform) => platform.value);
// Insertion order of the query string, so a given filter state always
// serialises to the same href.
const studioFilterKeys = ["format", "level", "platform", "topic"] as const;

export interface StudioBrowseParams {
  filters: StudioFilters;
  query: string;
}

/**
 * Reads browse filter state from the route's query string. Unknown values
 * fall back to "all" (or "" for the search) so a hand-edited or stale shared
 * link can never blank the library or desync a select.
 */
export function parseStudioFilters(search: {
  get(name: string): string | null;
}): StudioBrowseParams {
  return {
    filters: {
      format: oneOfOr(search.get("format"), lessonFormats, "all"),
      level: oneOfOr(search.get("level"), studioLevels, "all"),
      // Deliberately the full vocabulary, not just the active platforms: a
      // link shared before a platform went live still has to parse.
      platform: oneOfOr(search.get("platform"), allStudioPlatforms, "all"),
      topic: oneOfOr(search.get("topic"), studioTopics, "all"),
    },
    query: search.get("q") ?? "",
  };
}

/**
 * Serialises browse state back to a shareable href. Defaults are omitted so
 * the unfiltered library stays a clean `/studio/browse`, and an open lesson
 * id is preserved so a shared link reopens the same dialog.
 */
export function studioBrowseHref(
  filters: StudioFilters,
  query: string,
  lessonId?: string | null,
  relatedLessonIds: string[] = [],
): string {
  const params = new URLSearchParams();

  for (const key of studioFilterKeys) {
    if (filters[key] !== "all") {
      params.set(key, filters[key]);
    }
  }

  const trimmed = query.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  if (lessonId) {
    params.set("lesson", lessonId);
  }

  for (const id of relatedLessonIds) params.append("related", id);

  const queryString = params.toString();

  return queryString ? `/studio/browse?${queryString}` : "/studio/browse";
}

export interface ForYouContext {
  /** Mirror document id of the current programme; null between programmes. */
  programmeId: string | null;
  /** 1-based programme day; 0 when the programme has not started. */
  currentDay: number;
}

export type ForYouSelection =
  | { kind: "contextual"; lessons: StudioLessonCardModel[] }
  | { kind: "general"; lessons: StudioLessonCardModel[] }
  | { kind: "none" };

/**
 * For-you selection as a pure function over the library the page already
 * holds — no second endpoint (see the ticket's D1). The client preserves API
 * order everywhere, so "first `limit`" means newest first, including within
 * the contextual set.
 */
export function selectForYouLessons(
  cards: StudioLessonCardModel[],
  context: ForYouContext,
  limit = 3,
): ForYouSelection {
  if (context.programmeId === null || context.currentDay === 0) {
    return { kind: "general", lessons: cards.slice(0, limit) };
  }

  const { programmeId, currentDay } = context;
  const matches = cards.filter(
    (card) =>
      card.programmeRelevance.includes(programmeId) &&
      card.programmeDayStart !== null &&
      card.programmeDayEnd !== null &&
      card.programmeDayStart <= currentDay &&
      currentDay <= card.programmeDayEnd,
  );

  if (matches.length === 0) {
    return { kind: "none" };
  }

  // Only a contextual pick is "matched": the general fallback is the newest
  // lessons, not lessons chosen for this user, and badging it would overclaim.
  return {
    kind: "contextual",
    lessons: matches
      .slice(0, limit)
      .map((card) => ({ ...card, matched: true })),
  };
}

export interface ForYouCopy {
  heading: string;
  subcopy: string;
}

/**
 * The words above the For-you grid, per branch. Tested here so the three
 * branches stay distinguishable without a component harness: the home
 * renders exactly what this returns.
 */
export function forYouSectionCopy(
  selection: ForYouSelection,
  context: { currentDay: number; programmeTitle: string | null },
): ForYouCopy {
  if (selection.kind === "general") {
    return {
      heading: "For you",
      subcopy: context.programmeTitle
        ? context.currentDay > 0
          ? "Your programme is in progress - explore the newest lessons while matching recommendations are prepared."
          : "Your programme starts on day 1 - explore the newest lessons in the meantime."
        : "Explore the newest lessons from the library.",
    };
  }

  if (selection.kind === "none") {
    return {
      heading: "For you",
      subcopy:
        context.currentDay > 0
          ? `Nothing lines up with day ${context.currentDay} of your programme yet - the full library is open.`
          : "Nothing lines up with your programme yet - the full library is open.",
    };
  }

  return {
    heading: "For you",
    subcopy:
      context.currentDay > 0 && context.programmeTitle
        ? `Picked for day ${context.currentDay} of ${context.programmeTitle}.`
        : "Picked for where you are in your programme.",
  };
}
