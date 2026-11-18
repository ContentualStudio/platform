import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  activeStudioPlatforms,
  defaultStudioFilters,
  filterStudioLessons,
  forYouSectionCopy,
  parseStudioFilters,
  selectForYouLessons,
  studioBrowseHref,
  studioPlatformOptions,
  toStudioLessonCard,
  type StudioLessonCardModel,
} from "./studio";
import type { StudioLessonSummary } from "./server-studio-lessons";

function lesson(
  overrides: Partial<StudioLessonSummary> = {},
): StudioLessonSummary {
  return {
    id: "lesson-1",
    slug: "lesson-1",
    title: "Lesson",
    summary: "A lesson.",
    attachmentsCount: 0,
    minimumTier: "free",
    locked: false,
    lessonType: "video",
    skillLevel: "intermediate",
    contentType: "caption",
    platforms: ["instagram"],
    programmeRelevance: ["42"],
    programmeDayStart: 1,
    programmeDayEnd: 7,
    ...overrides,
  };
}

test("the card reads format, level, topic and platform from authored tags", () => {
  const card = toStudioLessonCard(lesson());

  assert.equal(card.format, "video");
  assert.equal(card.level, "Intermediate");
  assert.equal(card.topicLabel, "Caption");
  assert.deepEqual(card.platforms, ["instagram"]);
  assert.equal(card.platformLabel, "Instagram");
});

test("the card carries programme targeting through for For-you matching", () => {
  const card = toStudioLessonCard(
    lesson({
      programmeRelevance: ["7", "8"],
      programmeDayStart: 3,
      programmeDayEnd: 9,
    }),
  );

  assert.deepEqual(card.programmeRelevance, ["7", "8"]);
  assert.equal(card.programmeDayStart, 3);
  assert.equal(card.programmeDayEnd, 9);
});

test("a pre-backfill row still renders instead of blanking the page", () => {
  const card = toStudioLessonCard(
    lesson({
      lessonType: null,
      skillLevel: null,
      contentType: null,
      platforms: [],
    }),
  );

  assert.equal(card.format, "article");
  assert.equal(card.level, "Beginner");
  assert.equal(card.topicLabel, "Foundation");
  assert.deepEqual(card.platforms, []);
  assert.equal(card.platformLabel, "Instagram");
});

test("a multi-platform lesson survives each of its platform filters", () => {
  const cards = [
    toStudioLessonCard(
      lesson({ id: "multi", platforms: ["youtube", "instagram"] }),
    ),
    toStudioLessonCard(lesson({ id: "single", platforms: ["youtube"] })),
  ];

  const base = {
    format: "all" as const,
    level: "all" as const,
    platform: "instagram",
    topic: "all" as const,
  };

  assert.deepEqual(
    filterStudioLessons(cards, base).map((card) => card.id),
    ["multi"],
  );
  assert.deepEqual(
    filterStudioLessons(cards, { ...base, platform: "all" }).map(
      (card) => card.id,
    ),
    ["multi", "single"],
  );
});

test("an untagged row stays visible under every platform filter", () => {
  const cards = [toStudioLessonCard(lesson({ id: "untagged", platforms: [] }))];

  assert.deepEqual(
    filterStudioLessons(cards, {
      format: "all",
      level: "all",
      platform: "instagram",
      topic: "all",
    }).map((card) => card.id),
    ["untagged"],
  );
});

test("the web platform vocabulary agrees with the CMS source of truth", () => {
  // Until the vocabulary moves to a shared packages/ workspace, this drift
  // guard fails the build when the CMS list and the web mirror disagree, so a
  // platform flipped to active cannot silently miss its Studio filter.
  const cmsFile = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "cms",
    "src",
    "collections",
    "content-validation.ts",
  );
  const source = readFileSync(cmsFile, "utf8");
  const block = source.slice(
    source.indexOf("export const lessonPlatformOptions"),
    source.indexOf("export const lessonPlatformValues"),
  );
  const entries = [
    ...block.matchAll(
      /\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*status:\s*"([^"]+)"\s*\}/g,
    ),
  ].map((match) => ({
    value: match[1],
    label: match[2],
    status: match[3],
  }));

  assert.ok(
    entries.length > 0,
    "could not parse lessonPlatformOptions from the CMS",
  );
  assert.deepEqual([...studioPlatformOptions], entries);
});

test("only active platforms appear as filters", () => {
  assert.deepEqual([...activeStudioPlatforms], ["instagram"]);
});

function forYouCard(
  id: string,
  overrides: Partial<StudioLessonSummary> = {},
): StudioLessonCardModel {
  return toStudioLessonCard(lesson({ id, ...overrides }));
}

test("For-you matches on programme and day", () => {
  const cards = [
    forYouCard("match", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
    forYouCard("other-programme", {
      programmeRelevance: ["8"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
  ];

  const selection = selectForYouLessons(cards, {
    programmeId: "7",
    currentDay: 3,
  });

  assert.equal(selection.kind, "contextual");
  assert.deepEqual(
    selection.kind === "contextual"
      ? selection.lessons.map((card) => card.id)
      : [],
    ["match"],
  );
});

test("For-you matches on the exact day bounds", () => {
  const cards = [
    forYouCard("start", {
      programmeRelevance: ["7"],
      programmeDayStart: 3,
      programmeDayEnd: 9,
    }),
    forYouCard("end", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 3,
    }),
  ];

  for (const day of [1, 3, 9]) {
    const selection = selectForYouLessons(cards, {
      programmeId: "7",
      currentDay: day,
    });
    assert.equal(selection.kind, "contextual", `day ${day} should match`);
  }

  const both = selectForYouLessons(cards, {
    programmeId: "7",
    currentDay: 3,
  });
  assert.deepEqual(
    both.kind === "contextual" ? both.lessons.map((card) => card.id) : [],
    ["start", "end"],
  );
});

test("For-you excludes days outside the range", () => {
  const cards = [
    forYouCard("window", {
      programmeRelevance: ["7"],
      programmeDayStart: 3,
      programmeDayEnd: 5,
    }),
  ];

  assert.equal(
    selectForYouLessons(cards, { programmeId: "7", currentDay: 2 }).kind,
    "none",
  );
  assert.equal(
    selectForYouLessons(cards, { programmeId: "7", currentDay: 6 }).kind,
    "none",
  );
});

test("a card missing a day bound is never contextual", () => {
  const cards = [
    forYouCard("no-start", {
      programmeRelevance: ["7"],
      programmeDayStart: null,
      programmeDayEnd: 7,
    }),
    forYouCard("no-end", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: null,
    }),
  ];

  assert.equal(
    selectForYouLessons(cards, { programmeId: "7", currentDay: 3 }).kind,
    "none",
  );
});

test("no programme falls back to the newest general set", () => {
  const cards = [
    forYouCard("a"),
    forYouCard("b"),
    forYouCard("c"),
    forYouCard("d"),
  ];

  const selection = selectForYouLessons(cards, {
    programmeId: null,
    currentDay: 3,
  });

  assert.equal(selection.kind, "general");
  assert.deepEqual(
    selection.kind === "general"
      ? selection.lessons.map((card) => card.id)
      : [],
    ["a", "b", "c"],
  );
});

test("a programme that has not started falls back to the general set", () => {
  const cards = [forYouCard("a"), forYouCard("b")];

  const selection = selectForYouLessons(cards, {
    programmeId: "7",
    currentDay: 0,
  });

  assert.equal(selection.kind, "general");
  assert.deepEqual(
    selection.kind === "general"
      ? selection.lessons.map((card) => card.id)
      : [],
    ["a", "b"],
  );
});

test("a programme with no matching lesson is a real empty state", () => {
  const cards = [
    forYouCard("elsewhere", {
      programmeRelevance: ["8"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
  ];

  assert.deepEqual(
    selectForYouLessons(cards, { programmeId: "7", currentDay: 3 }),
    { kind: "none" },
  );
});

test("For-you respects the limit", () => {
  const cards = [
    forYouCard("a", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
    forYouCard("b", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
    forYouCard("c", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
    forYouCard("d", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
  ];

  const selection = selectForYouLessons(
    cards,
    { programmeId: "7", currentDay: 2 },
    2,
  );

  assert.equal(selection.kind, "contextual");
  assert.deepEqual(
    selection.kind === "contextual"
      ? selection.lessons.map((card) => card.id)
      : [],
    ["a", "b"],
  );
});

test("each For-you branch has its own copy", () => {
  assert.deepEqual(
    forYouSectionCopy(
      { kind: "general", lessons: [] },
      { currentDay: 0, programmeTitle: null },
    ),
    {
      heading: "For you",
      subcopy: "Explore the newest lessons from the library.",
    },
  );
  assert.deepEqual(
    forYouSectionCopy(
      { kind: "none" },
      { currentDay: 4, programmeTitle: "First Take" },
    ),
    {
      heading: "For you",
      subcopy:
        "Nothing lines up with day 4 of your programme yet - the full library is open.",
    },
  );
  assert.deepEqual(
    forYouSectionCopy(
      { kind: "contextual", lessons: [] },
      { currentDay: 4, programmeTitle: "First Take" },
    ),
    {
      heading: "For you",
      subcopy: "Picked for day 4 of First Take.",
    },
  );
});

test("browse params parse from the query string", () => {
  const params = new URLSearchParams(
    "format=video&level=advanced&platform=instagram&topic=photo&q=hook",
  );

  assert.deepEqual(parseStudioFilters(params), {
    filters: {
      format: "video",
      level: "advanced",
      platform: "instagram",
      topic: "photo",
    },
    query: "hook",
  });
});

test("browse params fall back on unknown values", () => {
  const params = new URLSearchParams(
    "format=essay&level=expert&platform=myspace&topic=foundation",
  );

  assert.deepEqual(parseStudioFilters(params), {
    filters: { ...defaultStudioFilters },
    query: "",
  });
  assert.deepEqual(parseStudioFilters(new URLSearchParams("")), {
    filters: { ...defaultStudioFilters },
    query: "",
  });
});

test("browse hrefs omit defaults and preserve the open lesson", () => {
  assert.equal(studioBrowseHref(defaultStudioFilters, ""), "/studio/browse");
  assert.equal(
    studioBrowseHref(
      { ...defaultStudioFilters, level: "beginner", topic: "video" },
      "hook",
      "lesson-1",
    ),
    "/studio/browse?level=beginner&topic=video&q=hook&lesson=lesson-1",
  );
});

test("topic filters match the content-type vocabulary", () => {
  const cards = [
    toStudioLessonCard(lesson({ id: "a", contentType: "video" })),
    toStudioLessonCard(lesson({ id: "b", contentType: "photo" })),
  ];

  assert.deepEqual(
    filterStudioLessons(cards, {
      format: "all",
      level: "all",
      platform: "all",
      topic: "photo",
    }).map((card) => card.id),
    ["b"],
  );
});

test("a contextual pick is badged as matched; a general fallback is not", () => {
  const cards = [
    forYouCard("match", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
  ];

  const contextual = selectForYouLessons(cards, {
    programmeId: "7",
    currentDay: 3,
  });

  assert.equal(contextual.kind, "contextual");
  assert.equal(
    contextual.kind === "contextual" ? contextual.lessons[0].matched : null,
    true,
    "a lesson picked for the user's day carries the badge",
  );

  // Between programmes the same lesson is only "newest", not "for you".
  const general = selectForYouLessons(cards, {
    programmeId: null,
    currentDay: 0,
  });

  assert.equal(general.kind, "general");
  assert.equal(
    general.kind === "general" ? general.lessons[0].matched : null,
    false,
    "the general fallback must not claim the lesson was matched",
  );
});

test("selection never mutates the cards it was given", () => {
  const cards = [
    forYouCard("match", {
      programmeRelevance: ["7"],
      programmeDayStart: 1,
      programmeDayEnd: 7,
    }),
  ];

  selectForYouLessons(cards, { programmeId: "7", currentDay: 3 });

  assert.equal(
    cards[0].matched,
    false,
    "badging a contextual pick must not leak back into the browse grid",
  );
});

test("general lessons do not deny an active programme when its mirror identity is missing", () => {
  const selection = selectForYouLessons([forYouCard("newest")], {
    programmeId: null,
    currentDay: 3,
  });
  assert.equal(selection.kind, "general");
  assert.deepEqual(
    forYouSectionCopy(selection, {
      currentDay: 3,
      programmeTitle: "First Take",
    }),
    {
      heading: "For you",
      subcopy:
        "Your programme is in progress - explore the newest lessons while matching recommendations are prepared.",
    },
  );
});

test("general lessons distinguish an enrolled programme waiting for day one", () => {
  const selection = selectForYouLessons([forYouCard("newest")], {
    programmeId: "7",
    currentDay: 0,
  });
  assert.deepEqual(
    forYouSectionCopy(selection, {
      currentDay: 0,
      programmeTitle: "First Take",
    }),
    {
      heading: "For you",
      subcopy:
        "Your programme starts on day 1 - explore the newest lessons in the meantime.",
    },
  );
});

test('related lesson scope survives browse filter and lesson URL changes', () => {
  const url = new URL(studioBrowseHref(defaultStudioFilters, 'camera', 'film', ['film', 'edit']), 'https://example.test');
  assert.deepEqual(url.searchParams.getAll('related'), ['film', 'edit']);
  assert.equal(url.searchParams.get('lesson'), 'film');
});
