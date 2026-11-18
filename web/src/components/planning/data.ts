// Placeholder data + shapes for the Planning UI. Saved outputs are produced by
// programme tasks, so they are read-only here and arrive from the api once that
// endpoint exists. Notes and ideas are user-authored and persist to
// localStorage until they get a backing store.

import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  LayoutGrid,
  Map,
  Mic,
  type LucideIcon,
} from "lucide-react";

export type OutputType = "template" | "board" | "recording" | "plan";

export type OutputStatus = "draft" | "final";

export interface TaskOutput {
  id: string;
  name: string;
  icon: OutputIconName;
  /** Tailwind classes for the icon chip, light + dark. */
  tint: string;
  type: OutputType;
  /** Programme task that generated the output. */
  task: string;
  createdAt: string;
  lastModified: string;
  status: OutputStatus;
  tags: string[];
  favorite: boolean;
  preview: string;
}

export type OutputIconName =
  | "arrow-up-right"
  | "layout-grid"
  | "mic"
  | "file-text"
  | "calendar"
  | "map";

export const OUTPUT_ICONS: Record<OutputIconName, LucideIcon> = {
  "arrow-up-right": ArrowUpRight,
  calendar: CalendarDays,
  "file-text": FileText,
  "layout-grid": LayoutGrid,
  map: Map,
  mic: Mic,
};

export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  board: "Board",
  plan: "Plan",
  recording: "Recording",
  template: "Template",
};

export type OutputTypeFilter = OutputType | "all";

export type OutputSort = "newest" | "oldest" | "edited";

export const OUTPUT_TYPE_OPTIONS: { value: OutputTypeFilter; label: string }[] =
  [
    { label: "All types", value: "all" },
    { label: "Templates", value: "template" },
    { label: "Boards", value: "board" },
    { label: "Recordings", value: "recording" },
    { label: "Plans", value: "plan" },
  ];

export const OUTPUT_SORT_OPTIONS: { value: OutputSort; label: string }[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Recently edited", value: "edited" },
];

/** Only document-shaped outputs can be exported to a file. */
export function isDownloadable(type: OutputType) {
  return type === "template" || type === "plan";
}

export const SEED_OUTPUTS: TaskOutput[] = [
  {
    createdAt: "2025-10-05",
    favorite: false,
    icon: "arrow-up-right",
    id: "cc",
    lastModified: "2025-10-05",
    name: "Content Compass Card",
    preview: "Your brand direction: bold, creator-first, orange-accented.",
    status: "final",
    tags: ["brand"],
    task: "Brand Discovery",
    tint: "bg-tint-blue-soft text-tint-blue",
    type: "template",
  },
  {
    createdAt: "2025-10-05",
    favorite: false,
    icon: "layout-grid",
    id: "pb",
    lastModified: "2025-10-06",
    name: "Pillars Board",
    preview:
      "3 content pillars: Tutorials, Behind-the-scenes, Industry commentary.",
    status: "final",
    tags: ["content"],
    task: "Brand Discovery",
    tint: "bg-tint-red-soft text-tint-red",
    type: "board",
  },
  {
    createdAt: "2025-10-06",
    favorite: true,
    icon: "mic",
    id: "pt",
    lastModified: "2025-10-06",
    name: "Practice Tape",
    preview: "2:14 recording - reviewed by Cee AI.",
    status: "draft",
    tags: ["practice"],
    task: "Speaking Practice",
    tint: "bg-tint-green-soft text-tint-green",
    type: "recording",
  },
  {
    createdAt: "2025-10-07",
    favorite: false,
    icon: "file-text",
    id: "ss",
    lastModified: "2025-10-08",
    name: "Script Skeleton",
    preview: "Hook → Problem → Solution → CTA structure for 60s reels.",
    status: "draft",
    tags: ["scripts"],
    task: "Content Creation",
    tint: "bg-tint-amber-soft text-tint-amber",
    type: "template",
  },
  {
    createdAt: "2025-10-07",
    favorite: true,
    icon: "calendar",
    id: "ws",
    lastModified: "2025-10-07",
    name: "Weekly Content System",
    preview: "Mon/Thu posting schedule with batch-production workflow.",
    status: "final",
    tags: ["planning"],
    task: "Content Creation",
    tint: "bg-tint-indigo-soft text-tint-indigo",
    type: "plan",
  },
  {
    createdAt: "2025-10-08",
    favorite: false,
    icon: "map",
    id: "dp",
    lastModified: "2025-10-09",
    name: "30-Day Plan",
    preview: "Day-by-day content calendar with growth milestones.",
    status: "draft",
    tags: ["planning"],
    task: "Strategy Workshop",
    tint: "bg-tint-purple-soft text-tint-purple",
    type: "plan",
  },
];

export interface ContentIdea {
  id: string;
  title: string;
  platform: string;
  contentType: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export const IDEA_PLATFORMS = [
  "Instagram",
  "YouTube",
  "TikTok",
  "LinkedIn",
  "Twitter/X",
  "Facebook",
  "Blog",
  "Podcast",
  "Newsletter",
] as const;

export const IDEA_CONTENT_TYPES = [
  "Reel",
  "Post",
  "Story",
  "Carousel",
  "Video",
  "Article",
  "Thread",
  "Short",
  "Live",
  "Tutorial",
] as const;

/** Platform filters offered as sort pills, in the order the design shows them. */
export const IDEA_SORT_PLATFORMS = [
  "Instagram",
  "LinkedIn",
  "YouTube",
  "Newsletter",
  "TikTok",
] as const;

export const SEED_IDEAS: ContentIdea[] = [
  {
    contentType: "Reel",
    createdAt: "2025-10-01T08:00:00Z",
    id: "sn-seed1",
    notes:
      "Film my 7am setup: coffee, lighting check, script review on iPad. Keep it under 30s.",
    platform: "Instagram",
    title: "Morning routine BTS",
  },
  {
    contentType: "Tutorial",
    createdAt: "2025-10-03T14:30:00Z",
    id: "sn-seed2",
    notes:
      "Walk through my editing workflow: rough cut → transitions → colour grade → captions → export. Target 8-12 min.",
    platform: "YouTube",
    title: "How I edit in CapCut",
  },
  {
    contentType: "Video",
    createdAt: "2025-10-05T10:00:00Z",
    id: "sn-seed3",
    notes:
      "Answer top 3 questions from comments: how I started, gear I use, how I stay consistent. Stitch format.",
    platform: "TikTok",
    title: "Q&A: Creator journey",
  },
  {
    contentType: "Carousel",
    createdAt: "2025-10-07T09:00:00Z",
    id: "sn-seed4",
    notes:
      "5 lessons from 6 months of consistent posting. One per slide, strong visuals, CTA to follow on last slide.",
    platform: "LinkedIn",
    title: "LinkedIn carousel: 5 lessons",
  },
  {
    contentType: "Article",
    createdAt: "2025-10-08T16:00:00Z",
    id: "sn-seed5",
    notes:
      "Topic: Why short-form video is eating long-form. Data points: retention rates, platform algorithms, creator earnings comparison.",
    platform: "Newsletter",
    title: "Weekly newsletter topic",
  },
  {
    contentType: "Video",
    createdAt: "2025-10-09T11:00:00Z",
    id: "sn-seed6",
    notes:
      'Hook 1: "I flew to X with zero plan." Hook 2: "This is what $100 gets you in X." Test both, see which CTR is higher.',
    platform: "YouTube",
    title: "Travel vlog hook ideas",
  },
];

export function formatShortDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

export function formatLongDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
