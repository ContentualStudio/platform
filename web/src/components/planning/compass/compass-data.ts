// Content Compass sample data.
//
// Compass needs niche-wide post analysis that the platform does not collect
// yet, so every number here is illustrative. The page labels it as a preview;
// when the real feed lands it replaces this module behind the same shapes.

export type CompassPlatform = "all" | "instagram" | "tiktok" | "youtube" | "linkedin";
export type CompassRange = "7d" | "30d" | "90d";
export type CompassLens = "niche" | "me";

export const COMPASS_PLATFORMS: { id: CompassPlatform; label: string }[] = [
  { id: "all", label: "All platforms" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
];

export const COMPASS_RANGES: { id: CompassRange; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

export const SAMPLE_NICHE = "Travel & lifestyle";

/** [format, niche average %, your average %] */
export type FormatRow = [string, number, number];

export const FORMATS: Record<CompassPlatform, FormatRow[]> = {
  all: [
    ["Short-form video", 7.8, 5.9],
    ["Carousel", 6.1, 6.6],
    ["Talking-head explainer", 5.4, 3.2],
    ["Day-in-the-life vlog", 4.9, 4.1],
    ["Tutorial / how-to", 4.2, 4.8],
    ["Photo dump", 3.1, 2.4],
  ],
  instagram: [
    ["Reels", 8.2, 6.1],
    ["Carousel", 7.4, 7.0],
    ["Photo dump", 4.0, 2.9],
    ["Stories (polls)", 3.6, 3.3],
    ["Single image", 2.2, 1.8],
  ],
  tiktok: [
    ["POV / storytime", 9.6, 6.2],
    ["Itinerary in 30s", 8.8, 7.4],
    ["Green-screen explainer", 6.3, 3.0],
    ["Day-in-the-life", 5.5, 4.9],
    ["Slideshow", 4.7, 2.1],
  ],
  youtube: [
    ["Shorts", 6.9, 5.0],
    ["Long-form vlog (15m+)", 5.8, 4.6],
    ["Tutorial / guide", 5.1, 5.5],
    ["Cost breakdown", 4.9, 2.8],
    ["Live / Q&A", 2.0, 1.4],
  ],
  linkedin: [
    ["Document carousel", 5.6, 4.9],
    ["Text + image story", 4.1, 3.6],
    ["Native video", 3.3, 1.9],
    ["Poll", 2.8, 2.6],
    ["Link post", 1.1, 0.9],
  ],
};

export interface Topic {
  name: string;
  /** Audience demand, 0-100. */
  demand: number;
  /** Competition, 0-100. */
  competition: number;
  /** Week-on-week view growth, %. */
  growth: number;
  /** How much of your own content covers it, 0-1. */
  coverage: number;
}

export const TOPICS: Topic[] = [
  { name: "Budget itineraries", demand: 84, competition: 72, growth: 18, coverage: 0.72 },
  { name: "Hidden gems & dupes", demand: 78, competition: 34, growth: 46, coverage: 0.06 },
  { name: "Solo travel safety", demand: 66, competition: 28, growth: 31, coverage: 0 },
  { name: "Packing hacks", demand: 58, competition: 81, growth: 4, coverage: 0.78 },
  { name: "Slow travel", demand: 52, competition: 22, growth: 39, coverage: 0.1 },
  { name: "Nomad cost of living", demand: 71, competition: 47, growth: 22, coverage: 0.14 },
  { name: "Airport hacks", demand: 62, competition: 66, growth: -6, coverage: 0.58 },
  { name: "Luxury for less", demand: 91, competition: 58, growth: 12, coverage: 0.12 },
  { name: "Train travel Europe", demand: 45, competition: 30, growth: 27, coverage: 0.5 },
  { name: "Food tours", demand: 40, competition: 62, growth: -3, coverage: 0.2 },
  { name: "Morning routines", demand: 36, competition: 76, growth: -11, coverage: 0.84 },
  { name: "Gear & camera setup", demand: 48, competition: 55, growth: 8, coverage: 0.62 },
];

/** Per-platform nudges to [demand, competition, growth]. */
const PLATFORM_BIAS: Record<CompassPlatform, Record<string, [number, number, number]>> = {
  all: {},
  instagram: {
    "Luxury for less": [8, 0, 10],
    "Hidden gems & dupes": [6, 6, 4],
    "Solo travel safety": [-10, 0, -8],
  },
  tiktok: {
    "Hidden gems & dupes": [4, -4, 14],
    "Airport hacks": [14, 0, 18],
    "Slow travel": [-14, 0, -10],
    "Packing hacks": [10, 0, 6],
  },
  youtube: {
    "Nomad cost of living": [16, -8, 12],
    "Slow travel": [14, 0, 8],
    "Packing hacks": [-12, 0, -4],
    "Train travel Europe": [18, -4, 10],
  },
  linkedin: {
    "Nomad cost of living": [22, -20, 20],
    "Solo travel safety": [-20, 0, -10],
    "Morning routines": [24, -20, 16],
    "Food tours": [-24, 0, -10],
  },
};

const RANGE_GROWTH: Record<CompassRange, number> = { "7d": 1.25, "30d": 1, "90d": 0.7 };
const RANGE_POSTS: Record<CompassRange, number> = { "7d": 0.3, "30d": 1, "90d": 2.7 };
const PLATFORM_POSTS: Record<CompassPlatform, number> = {
  all: 4812,
  instagram: 1630,
  tiktok: 1944,
  youtube: 722,
  linkedin: 516,
};

const clamp = (value: number) => Math.max(8, Math.min(94, value));

export function topicsFor(platform: CompassPlatform, range: CompassRange): Topic[] {
  return TOPICS.map((topic) => {
    const [demand, competition, growth] = PLATFORM_BIAS[platform][topic.name] ?? [0, 0, 0];
    return {
      ...topic,
      demand: clamp(topic.demand + demand),
      competition: clamp(topic.competition + competition),
      growth: Math.round((topic.growth + growth) * RANGE_GROWTH[range]),
    };
  });
}

/** Opportunity rewards demand and growth, and discounts crowded topics. */
export function opportunityScore(topic: Topic): number {
  return topic.demand - 0.6 * topic.competition + 0.4 * topic.growth;
}

export function postsAnalysed(platform: CompassPlatform, range: CompassRange): number {
  return Math.round(PLATFORM_POSTS[platform] * RANGE_POSTS[range]);
}

export function rangeGrowthMultiplier(range: CompassRange): number {
  return RANGE_GROWTH[range];
}

/** [hook pattern, lift vs. average, category] */
export type HookRow = [string, number, string];

export const HOOKS: Record<CompassPlatform, HookRow[]> = {
  all: [
    ["I spent $___ in ___ for a week - here's everything", 2.4, "Cost reveal"],
    ["Don't book ___ until you see this", 1.9, "Warning"],
    ["The ___ nobody tells you about", 1.7, "Insider secret"],
  ],
  instagram: [
    ["Save this for your ___ trip", 2.1, "Save-bait"],
    ["3 places in ___ that feel illegal to know", 1.9, "Insider secret"],
    ["POV: you finally booked ___", 1.6, "POV"],
  ],
  tiktok: [
    ["POV: you skipped the tourist trap and found ___", 2.7, "POV"],
    ["Don't book ___ until you see this", 2.2, "Warning"],
    ["I spent $___ in ___ for a week", 2.0, "Cost reveal"],
  ],
  youtube: [
    ["I lived in ___ for 30 days. Here's what it really cost", 2.3, "Cost reveal"],
    ["The honest truth about ___", 1.8, "Contrarian"],
    ["___ is overrated. Go here instead", 1.7, "Contrarian"],
  ],
  linkedin: [
    ["I quit my job to travel. 12 months later, here's the maths", 2.5, "Story + numbers"],
    ["What ___ taught me about working remotely", 1.7, "Lesson"],
    ["Unpopular opinion: ___", 1.4, "Contrarian"],
  ],
};

export const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const HEATMAP_SLOTS = ["6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"];

/** Relative engagement, 0-1, per day (rows) and slot (columns). */
export const HEATMAP: number[][] = [
  [0.12, 0.38, 0.3, 0.46, 0.28, 0.32, 0.62, 0.74, 0.4],
  [0.1, 0.34, 0.28, 0.42, 0.26, 0.3, 0.58, 0.7, 0.36],
  [0.14, 0.4, 0.32, 0.5, 0.3, 0.36, 0.66, 0.82, 0.44],
  [0.12, 0.36, 0.3, 0.48, 0.3, 0.38, 0.7, 0.88, 0.46],
  [0.1, 0.3, 0.26, 0.4, 0.32, 0.42, 0.6, 0.66, 0.52],
  [0.08, 0.22, 0.46, 0.62, 0.58, 0.5, 0.56, 0.6, 0.48],
  [0.06, 0.2, 0.52, 0.7, 0.62, 0.54, 0.68, 0.76, 0.38],
];

/** Where the creator usually posts: [day index, slot index]. */
export const USUAL_POST_SLOT: [number, number] = [2, 3];

export interface OpportunityGap {
  topic: string;
  kicker: string;
  demand: number;
  competition: number;
  growth: number;
  format: string;
  platform: string;
  hook: string;
  signal: string;
}

export const GAPS: OpportunityGap[] = [
  {
    topic: "Hidden gems & dupes",
    kicker: "Sweet spot",
    demand: 78,
    competition: 34,
    growth: 46,
    format: "Short-form video",
    platform: "TikTok",
    hook: "___ is overrated. Go here instead",
    signal: "High demand",
  },
  {
    topic: "Solo travel safety",
    kicker: "High saves",
    demand: 66,
    competition: 28,
    growth: 31,
    format: "Carousel",
    platform: "Instagram",
    hook: "Save this before your first solo trip",
    signal: "Low competition",
  },
  {
    topic: "Slow travel",
    kicker: "Long watch time",
    demand: 52,
    competition: 22,
    growth: 39,
    format: "Long-form vlog",
    platform: "YouTube",
    hook: "I stayed in one town for a month. Here's why",
    signal: "Fast growing",
  },
];
