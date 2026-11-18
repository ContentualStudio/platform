// Stable programme presentation contract shared by the mirror reader and the
// test fixture. Production Welcome content is read from the published
// Payload -> app-Postgres mirror by ProgrammeContentRepository.
//
// Matching no longer reads this file at all: the decision tree selects a slug
// from the validated onboarding answers and the slug is resolved against the
// mirror. The catalogue below is a deterministic fixture for unit and event
// tests, which is why it carries no matcher metadata.
//
// Optional authored fields (founderVideo, expectations, any snapshot item)
// may be absent; the Welcome Page omits whatever is missing rather than
// breaking its layout. No consumer may hardcode a programme name — always
// resolve content by the assigned programme id.

import type { TierKey } from "../../billing/billing-tiers";
export interface ProgrammeFeature {
  icon: "clock" | "calendar" | "spark" | "target";
  label: string;
}

export interface ProgrammeSnapshotStat {
  label: string;
  value: string;
}

export interface FounderVideo {
  // Vimeo id; the Welcome Page builds an autoplay-off player embed from it.
  vimeoId: string;
  title?: string;
}

export interface ExpectationsCard {
  title: string;
  body: string;
}

export interface Programme {
  id: string;
  title: string;
  description: string;

  // Recommendation-card presentation (mockup "Here are some custom challenges").
  features: ProgrammeFeature[];
  difficulty: number; // 1..5, rendered as stars
  level: "Beginner" | "Intermediate" | "Advanced";
  durationLabel: string;
  durationDays: number;

  /**
   * Whether anyone may start this programme, or only a user the engine has
   * unlocked it for.
   *
   * Required, not optional: the repository narrows this fail-closed, and an
   * optional field would let a consumer read `undefined` and treat it as open
   * — turning a fail-closed guard into a fail-open one a layer above.
   */
  access: "open" | "locked";

  // Welcome Page authored content. All optional — omit when absent.
  founderVideo?: FounderVideo;
  snapshot?: ProgrammeSnapshotStat[];
  expectations?: ExpectationsCard;
  ctaText?: string;
  track?: string;
  /** Lowest billing tier that may start it. Absent means free. */
  minimumTier?: TierKey;
  milestones?: unknown[];
  insightMoments?: unknown[];
}

export const programmeContent: Programme[] = [
  {
    id: "15-day-jumpstart",
    title: "15 Day Jumpstart",
    access: "open",
    description:
      "If you struggle to stay consistent. Let's help you channel your creativity into results.",
    features: [
      { icon: "clock", label: "15-Day Consistency Sprint" },
      {
        icon: "calendar",
        label: "Daily micro-prompts + Accountability Streaks",
      },
    ],
    difficulty: 1,
    level: "Beginner",
    durationLabel: "2 Weeks",
    durationDays: 15,
    founderVideo: { vimeoId: "76979871", title: "A word from our founder" },
    snapshot: [
      { label: "Duration", value: "15 days" },
      { label: "Cadence", value: "1 task per day" },
      { label: "Focus", value: "Consistency & momentum" },
    ],
    expectations: {
      title: "What to honestly expect",
      body: "This is a sprint, not a miracle. Show up for a few minutes each day, expect a couple of awkward posts early on, and trust the streak. Results compound — most creators feel the shift by the second week.",
    },
  },
  {
    id: "30-day-foundation",
    title: "30 Day Foundation",
    access: "open",
    description:
      "Build a repeatable content system. Find your voice, your niche, and a rhythm you can sustain.",
    features: [
      { icon: "target", label: "Niche & positioning workshop" },
      { icon: "calendar", label: "Weekly content batching plan" },
    ],
    difficulty: 3,
    level: "Intermediate",
    durationLabel: "4 Weeks",
    durationDays: 30,
    founderVideo: { vimeoId: "76979871", title: "A word from our founder" },
    snapshot: [
      { label: "Duration", value: "30 days" },
      { label: "Cadence", value: "4–5 tasks per week" },
      { label: "Focus", value: "Systems & positioning" },
    ],
    expectations: {
      title: "What to honestly expect",
      body: "Real systems take real reps. You'll batch, ship, and review every week — some weeks will feel like a grind. Stick with it and you'll leave with a content engine you can run on autopilot.",
    },
  },
  {
    id: "30-day-growth",
    title: "30 Day Growth",
    access: "open",
    description:
      "For creators ready to scale. Double down on what works and turn reach into real momentum.",
    features: [
      { icon: "spark", label: "Data-led content optimization" },
      { icon: "target", label: "Audience growth playbook" },
    ],
    difficulty: 5,
    level: "Advanced",
    durationLabel: "4 Weeks",
    durationDays: 30,
    // Deliberately no founderVideo/expectations here to exercise the Welcome
    // Page's "omit absent optional fields" behavior.
    snapshot: [
      { label: "Duration", value: "30 days" },
      { label: "Cadence", value: "Daily" },
      { label: "Focus", value: "Scaling what works" },
    ],
  },
  {
    id: "first-take",
    title: "First Take",
    access: "open",
    description:
      "The entry point to Contentual for complete beginners who have never posted with intention.",
    features: [
      { icon: "clock", label: "21-Day First Publish Programme" },
      { icon: "calendar", label: "Batch, publish, and build a repeatable workflow" },
    ],
    difficulty: 1,
    level: "Beginner",
    durationLabel: "3 Weeks",
    durationDays: 21,
    snapshot: [
      { label: "Duration", value: "21 days" },
      { label: "Cadence", value: "One task per day" },
      { label: "Focus", value: "First publish & repeatable workflow" },
    ],
    expectations: {
      title: "What to honestly expect",
      body: "This is for someone who has thought about starting to post content for months but has never done it with intention. Expect 30 to 150 minutes per day, a first real filming session on Day 6, a first live publish on Day 7, and ten published posts plus a 30-day forward plan by Day 21.",
    },
    ctaText: "Start First Take",
    track: "starter",
    // This metadata is only the server-side assignment boundary. The
    // authored programme copy and schedule are resolved from Payload after
    // assignment. Complete beginners are selected explicitly in the matcher
    // rather than competing with the legacy score-based catalogue.
  },
];

export function findProgramme(id: string): Programme | undefined {
  return programmeContent.find((programme) => programme.id === id);
}
