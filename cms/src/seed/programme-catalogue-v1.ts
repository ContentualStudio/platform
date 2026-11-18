import type { Payload } from "payload";
import { richText } from "./first-take-v1.1";

/**
 * LOCAL DEMO FIXTURES. The six programmes the specification names alongside First Take
 * ("Suggested initial rules"), seeded so the matching engine has something to
 * route to besides the fallback.
 *
 * The content here is deliberately thin and is not approved curriculum: enough of a published graph
 * (programme → module → lesson → task) for a rule to target a live programme
 * with publishable content, and no more. The Contentual team authors the real
 * curriculum in the admin area; this exists so matching can be exercised end
 * to end before that authoring is finished.
 */

export type Track =
  | "starter"
  | "grinder"
  | "pro"
  | "recovery"
  | "smb"
  | "keep_creating";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Difficulty = "easy" | "medium" | "hard";
export type ContentType = "video" | "photo" | "caption" | "story";
export type DayType = "push" | "protect" | "recharge";

export interface CatalogueTaskSpec {
  titleSuffix: string;
  dayNumber: number;
  dayType: DayType;
  contentType: ContentType;
  timeEstimateMinutes: number;
  instruction: string;
  output: string;
}

export interface CatalogueProgrammeSpec {
  slug: string;
  title: string;
  description: string;
  durationDays: number;
  experienceLevel: ExperienceLevel;
  difficulty: Difficulty;
  track: Track;
  expectations: string;
  ctaText: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonSummary: string;
  tasks: CatalogueTaskSpec[];
}

// A shared three-day opening shape. The programmes differ in who they are for,
// which is what matching cares about; giving each a bespoke schedule here would
// be inventing curriculum the content team has not written.
function openingTasks(
  focus: string,
  contentType: ContentType,
): CatalogueTaskSpec[] {
  return [
    {
      titleSuffix: "Set your starting point",
      dayNumber: 1,
      dayType: "protect",
      contentType: "caption",
      timeEstimateMinutes: 20,
      instruction: `Write down where you are today with ${focus}, in your own words.`,
      output: "A short written baseline you can compare against later.",
    },
    {
      titleSuffix: "Make one thing",
      dayNumber: 2,
      dayType: "push",
      contentType,
      timeEstimateMinutes: 45,
      instruction: `Produce a single piece of content that puts ${focus} into practice.`,
      output: "One finished piece, saved as a draft.",
    },
    {
      titleSuffix: "Review and adjust",
      dayNumber: 3,
      dayType: "recharge",
      contentType: "caption",
      timeEstimateMinutes: 15,
      instruction: "Look back at what you made and note one thing to change next time.",
      output: "One written adjustment for the week ahead.",
    },
  ];
}

export const catalogueProgrammes: readonly CatalogueProgrammeSpec[] = [
  {
    slug: "business-kickstart",
    title: "Business Kickstart",
    description:
      "For business owners getting their content off the ground, aimed at turning attention into customers.",
    durationDays: 14,
    experienceLevel: "beginner",
    difficulty: "easy",
    track: "smb",
    expectations:
      "Two weeks of short, business-first content tasks. You will leave with an offer you can talk about and a way to post about it repeatedly.",
    ctaText: "Start Business Kickstart",
    moduleTitle: "Week One — Say what you sell",
    lessonTitle: "Your offer in one sentence",
    lessonSummary:
      "Most business content fails because the offer is never stated plainly. This fixes that first.",
    tasks: openingTasks("saying what your business does", "video"),
  },
  {
    slug: "find-your-niche",
    title: "Find Your Niche",
    description:
      "For new creators who have not yet settled on what they post about.",
    durationDays: 14,
    experienceLevel: "beginner",
    difficulty: "easy",
    track: "starter",
    expectations:
      "Two weeks of narrowing down. You will test a few directions and finish with one you are willing to commit to.",
    ctaText: "Start Find Your Niche",
    moduleTitle: "Week One — Narrow the field",
    lessonTitle: "Three directions, one test each",
    lessonSummary:
      "A niche is chosen by testing, not by thinking. This week you test three.",
    tasks: openingTasks("choosing what you post about", "video"),
  },
  {
    slug: "youtube-deep-dive",
    title: "YouTube Deep Dive",
    description:
      "For creators whose main platform is YouTube and who already post with some regularity.",
    durationDays: 21,
    experienceLevel: "intermediate",
    difficulty: "medium",
    track: "pro",
    expectations:
      "Three weeks on the parts of YouTube that decide whether a video travels: packaging, retention and the first thirty seconds.",
    ctaText: "Start YouTube Deep Dive",
    moduleTitle: "Week One — Packaging",
    lessonTitle: "Title and thumbnail before script",
    lessonSummary:
      "The click decides everything downstream. Package the idea before you make it.",
    tasks: openingTasks("packaging a video idea", "video"),
  },
  {
    slug: "plateau-breaker",
    title: "Plateau Breaker",
    description:
      "For creators posting consistently whose engagement has stopped moving.",
    durationDays: 21,
    experienceLevel: "intermediate",
    difficulty: "medium",
    track: "recovery",
    expectations:
      "Three weeks of diagnosis and deliberate change. You will find what has gone stale and replace it with something you can measure.",
    ctaText: "Start Plateau Breaker",
    moduleTitle: "Week One — Diagnose the plateau",
    lessonTitle: "Reading your own last thirty posts",
    lessonSummary:
      "Before changing anything, establish what is actually flat and what only feels flat.",
    tasks: openingTasks("diagnosing flat engagement", "video"),
  },
  {
    slug: "brand-builder",
    title: "Brand Builder",
    description:
      "For experienced creators with an established audience who want the account to become a brand.",
    durationDays: 30,
    experienceLevel: "advanced",
    difficulty: "hard",
    track: "pro",
    expectations:
      "Thirty days of positioning, signature formats and the groundwork for anything you want to sell later.",
    ctaText: "Start Brand Builder",
    moduleTitle: "Week One — Positioning",
    lessonTitle: "What you are known for",
    lessonSummary:
      "A brand is the sentence other people use to describe you. This week you choose it deliberately.",
    tasks: openingTasks("positioning your account", "video"),
  },
  {
    slug: "thirty-day-foundations",
    title: "30-Day Foundations",
    description:
      "For creators who start and stop, aimed squarely at consistency rather than growth.",
    durationDays: 30,
    experienceLevel: "beginner",
    difficulty: "easy",
    track: "grinder",
    expectations:
      "Thirty days of small, repeatable tasks. The goal is a habit that survives the programme ending.",
    ctaText: "Start 30-Day Foundations",
    moduleTitle: "Week One — Show up",
    lessonTitle: "The smallest post you will still be proud of",
    lessonSummary:
      "Consistency is built by lowering the bar to something you can clear on a bad day.",
    tasks: openingTasks("posting on a schedule you can keep", "photo"),
  },
];

export interface CatalogueSeedResult {
  created: Record<string, number>;
  updated: Record<string, number>;
  programmeIdsBySlug: Record<string, string>;
}

type SeedDocument = Record<string, unknown> & { id?: string | number };
type PayloadSeedClient = Pick<Payload, "find" | "create" | "update">;

function idOf(document: SeedDocument): string | number {
  if (document.id === undefined || document.id === null) {
    throw new Error("Payload seed document did not return an id");
  }

  return document.id;
}

// Idempotent by slug, like the First Take seed: re-running edits the same
// documents rather than accumulating near-duplicates an operator has to tell
// apart. Every write publishes, because an unpublished target is not a target
// a matching rule can be published against.
async function upsert(
  payload: PayloadSeedClient,
  collection: string,
  slug: string,
  data: Record<string, unknown>,
  result: CatalogueSeedResult,
): Promise<SeedDocument> {
  const found = await payload.find({
    collection: collection as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { slug: { equals: slug } },
  });
  const existing = found.docs?.[0] as SeedDocument | undefined;
  const publishedData = { ...data, _status: "published" as const };

  if (existing) {
    const updated = (await payload.update({
      collection: collection as never,
      id: idOf(existing),
      data: publishedData as never,
      draft: false,
      overrideAccess: true,
    })) as unknown as SeedDocument;
    result.updated[collection] = (result.updated[collection] ?? 0) + 1;
    return updated;
  }

  const created = (await payload.create({
    collection: collection as never,
    data: publishedData as never,
    draft: false,
    overrideAccess: true,
  })) as unknown as SeedDocument;
  result.created[collection] = (result.created[collection] ?? 0) + 1;
  return created;
}

export async function seedProgrammeCatalogue(
  payload: PayloadSeedClient,
): Promise<CatalogueSeedResult> {
  const result: CatalogueSeedResult = {
    created: {},
    updated: {},
    programmeIdsBySlug: {},
  };

  for (const spec of catalogueProgrammes) {
    const programme = await upsert(
      payload,
      "programmes",
      spec.slug,
      {
        title: spec.title,
        key: spec.slug,
        lifecycleStatus: "live",
        slug: spec.slug,
        description: spec.description,
        durationDays: spec.durationDays,
        experienceLevel: spec.experienceLevel,
        difficulty: spec.difficulty,
        track: spec.track,
        expectations: richText(spec.expectations),
        ctaText: spec.ctaText,
        milestones: [],
        insightMoments: [],
      },
      result,
    );

    const lessonSlug = `${spec.slug}-orientation`;
    // Publishing a lesson requires its tagging vocabulary. The orientation
    // lesson covers the opening tasks, so it spans their days; lessonType is a
    // placeholder — an article, which is the type that carries `body`.
    const taskDays = spec.tasks.map((task) => task.dayNumber);
    const lesson = await upsert(
      payload,
      "lessons",
      lessonSlug,
      {
        title: spec.lessonTitle,
        slug: lessonSlug,
        summary: spec.lessonSummary,
        body: richText(spec.lessonSummary),
        lessonType: "article",
        skillLevel: spec.experienceLevel,
        contentType: spec.tasks[0]?.contentType ?? "video",
        platforms: ["instagram"],
        programmeRelevance: [idOf(programme)],
        programmeDayStart: Math.min(...taskDays),
        programmeDayEnd: Math.max(...taskDays),
      },
      result,
    );

    const moduleSlug = `${spec.slug}-week-1`;
    const moduleDocument = await upsert(
      payload,
      "modules",
      moduleSlug,
      {
        title: spec.moduleTitle,
        slug: moduleSlug,
        order: 1,
        programme: idOf(programme),
        lessons: [idOf(lesson)],
      },
      result,
    );

    for (const task of spec.tasks) {
      const taskSlug = `${spec.slug}-day-${task.dayNumber}`;
      await upsert(
        payload,
        "tasks",
        taskSlug,
        {
          title: `Day ${task.dayNumber} — ${task.titleSuffix}`,
          slug: taskSlug,
          instructions: richText(task.instruction),
          contentType: task.contentType,
          programme: idOf(programme),
          module: idOf(moduleDocument),
          lesson: idOf(lesson),
          dayNumber: task.dayNumber,
          orderWithinDay: 1,
          dayType: task.dayType,
          timeEstimateMinutes: task.timeEstimateMinutes,
          publishSlot: false,
          postNumber: null,
          outputDescription: richText(task.output),
        },
        result,
      );
    }

    result.programmeIdsBySlug[spec.slug] = String(idOf(programme));
  }

  return result;
}
