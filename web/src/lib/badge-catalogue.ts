export type BadgeCategory =
  | "consistency"
  | "programme"
  | "growth"
  | "community"
  | "marketplace";

export type BadgeState = "earned" | "locked";

export interface BadgeDefinition {
  category: BadgeCategory;
  image: string;
  name: string;
  state: BadgeState;
  title: string;
}

export const badgeCategoryLabels: Record<BadgeCategory, string> = {
  consistency: "Consistency",
  programme: "Programme",
  growth: "Growth",
  community: "Community",
  marketplace: "Marketplace",
};

/** Design catalogue — states default to locked until a read API lands. */
export const badgeCatalogue: BadgeDefinition[] = [
  {
    category: "consistency",
    image: "first-take.png",
    name: "First Take",
    state: "locked",
    title: "Complete your first daily task",
  },
  {
    category: "consistency",
    image: "hat-trick.png",
    name: "Hat Trick",
    state: "locked",
    title: "Complete three tasks in a row",
  },
  {
    category: "consistency",
    image: "warming-up.png",
    name: "Warming Up",
    state: "locked",
    title: "Complete seven tasks in a row",
  },
  {
    category: "consistency",
    image: "first-stretch.png",
    name: "First Stretch",
    state: "locked",
    title: "Complete fourteen tasks in a row",
  },
  {
    category: "consistency",
    image: "brick-by-brick.png",
    name: "Brick by Brick",
    state: "locked",
    title: "Complete thirty tasks in a row",
  },
  {
    category: "consistency",
    image: "centurion.png",
    name: "Centurion",
    state: "locked",
    title: "Complete one hundred tasks in a row",
  },
  {
    category: "consistency",
    image: "unstoppable.png",
    name: "Unstoppable",
    state: "locked",
    title: "Complete 365 tasks in a row",
  },
  {
    category: "consistency",
    image: "back-in-the-game.png",
    name: "Back in the Game",
    state: "locked",
    title: "Resume after a seven-day streak break",
  },
  {
    category: "programme",
    image: "first-step.png",
    name: "First Step",
    state: "locked",
    title: "Complete your first Contentual programme",
  },
  {
    category: "programme",
    image: "foundations-built.png",
    name: "Foundations Built",
    state: "locked",
    title: "Complete the 30-Day Foundations programme",
  },
  {
    category: "programme",
    image: "growth-unlocked.png",
    name: "Growth Unlocked",
    state: "locked",
    title: "Complete the 60-Day Plateau Breaker programme",
  },
  {
    category: "programme",
    image: "collector.png",
    name: "Collector",
    state: "locked",
    title: "Complete any three programmes",
  },
  {
    category: "programme",
    image: "full-set.png",
    name: "Full Set",
    state: "locked",
    title: "Complete all core Phase 1 programmes",
  },
  {
    category: "programme",
    image: "back-for-more.png",
    name: "Back for More",
    state: "locked",
    title: "Start another programme within 48 hours",
  },
  {
    category: "growth",
    image: "first-100-fans.png",
    name: "First 100 Fans",
    state: "locked",
    title: "Reach 100 followers on a connected platform",
  },
  {
    category: "growth",
    image: "the-thousand-club.png",
    name: "The Thousand Club",
    state: "locked",
    title: "Reach 1,000 followers on a connected platform",
  },
  {
    category: "growth",
    image: "10k-gold.png",
    name: "10K Gold",
    state: "locked",
    title: "Reach 10,000 followers on a connected platform",
  },
  {
    category: "growth",
    image: "engaged.png",
    name: "Engaged",
    state: "locked",
    title: "Achieve a 10 percent engagement rate in one week",
  },
  {
    category: "growth",
    image: "viral-moment.png",
    name: "Viral Moment",
    state: "locked",
    title: "Publish a post that exceeds ten times your average views",
  },
  {
    category: "growth",
    image: "multi-platform.png",
    name: "Multi-Platform",
    state: "locked",
    title: "Build consistently across three platforms",
  },
  {
    category: "growth",
    image: "channel-builder.png",
    name: "Channel Builder",
    state: "locked",
    title: "Connect YouTube and track it for thirty days",
  },
  {
    category: "growth",
    image: "reel-ready.png",
    name: "Reel Ready",
    state: "locked",
    title: "Connect Instagram and complete its deep-dive programme",
  },
  {
    category: "growth",
    image: "clocked-in.png",
    name: "Clocked In",
    state: "locked",
    title: "Connect TikTok and complete a TikTok task week",
  },
  {
    category: "growth",
    image: "open-for-business.png",
    name: "Open for Business",
    state: "locked",
    title: "Connect LinkedIn and complete a LinkedIn programme",
  },
  {
    category: "community",
    image: "conversation-starter.png",
    name: "Conversation Starter",
    state: "locked",
    title: "Post in a Creator Circle for the first time",
  },
  {
    category: "community",
    image: "mvp.png",
    name: "MVP",
    state: "locked",
    title: "Receive ten upvotes on one post",
  },
  {
    category: "community",
    image: "finisher.png",
    name: "Finisher",
    state: "locked",
    title: "Complete a weekly community challenge",
  },
  {
    category: "marketplace",
    image: "big-break.png",
    name: "Big Break",
    state: "locked",
    title: "Publish a template that becomes a Marketplace best-seller",
  },
  {
    category: "marketplace",
    image: "going-pro.png",
    name: "Going Pro",
    state: "locked",
    title: "Launch a paid Marketplace offering",
  },
  {
    category: "marketplace",
    image: "starting-lineup.png",
    name: "Starting Lineup",
    state: "locked",
    title: "Publish your first Marketplace template",
  },
];

export const levelTiers = [
  { image: "bronze.png", label: "Bronze", range: "0–99" },
  { image: "silver.png", label: "Silver", range: "100–299" },
  { image: "gold.png", label: "Gold", range: "300–699" },
  { image: "platinum.png", label: "Platinum", range: "700–1499" },
  { image: "champion.png", label: "Champion", range: "1500+" },
] as const;

export function badgeCountsByCategory() {
  const counts = new Map<BadgeCategory | "all", number>();
  counts.set("all", badgeCatalogue.length);

  for (const badge of badgeCatalogue) {
    counts.set(badge.category, (counts.get(badge.category) ?? 0) + 1);
  }

  return counts;
}
