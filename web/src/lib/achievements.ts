import type { BadgeCategory, BadgeDefinition } from "./badge-catalogue";

// The Achievements tab (design "Welcome 2"): the badge catalogue with the
// user's earned badges laid over it. Kept free of React so it can be tested.

export interface EarnedBadge {
  badgeId: string;
  key: string | null;
  name: string | null;
  earnedAt: string;
}

export type AchievementState = "earned" | "progress" | "locked";

export interface AchievementBadge {
  id: string;
  name: string;
  /** File under /brand/badges, or null for a badge with no artwork yet. */
  image: string | null;
  category: BadgeCategory | null;
  title: string;
  state: AchievementState;
  earnedAt: string | null;
  progress: { current: number; target: number } | null;
}

// The consistency ladder is the only family whose progress the app can show
// today: each rung is a run of completed tasks, and the live streak is that run.
const STREAK_TARGETS: Record<string, number> = {
  "Hat Trick": 3,
  "Warming Up": 7,
  "First Stretch": 14,
  "Brick by Brick": 30,
  Centurion: 100,
  Unstoppable: 365,
};

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Every catalogue badge with its state, then any earned badge the catalogue
 * does not know (listed by its stored name or id, without artwork).
 */
export function mergeAchievements(
  catalogue: BadgeDefinition[],
  earned: EarnedBadge[],
  currentStreak: number,
): AchievementBadge[] {
  const unmatched = new Set(earned);
  const findEarned = (definition: BadgeDefinition) => {
    const name = normalise(definition.name);
    const match = earned.find(
      (badge) =>
        (badge.name && normalise(badge.name) === name) ||
        (badge.key && normalise(badge.key) === name),
    );
    if (match) unmatched.delete(match);
    return match;
  };

  const known = catalogue.map((definition): AchievementBadge => {
    const match = findEarned(definition);
    const target = STREAK_TARGETS[definition.name];
    const inProgress = !match && target !== undefined && currentStreak > 0;

    return {
      id: normalise(definition.name),
      name: definition.name,
      image: definition.image,
      category: definition.category,
      title: definition.title,
      state: match ? "earned" : inProgress ? "progress" : "locked",
      earnedAt: match?.earnedAt ?? null,
      progress: inProgress ? { current: Math.min(currentStreak, target), target } : null,
    };
  });

  const extra = [...unmatched].map(
    (badge): AchievementBadge => ({
      id: badge.badgeId,
      name: badge.name ?? badge.key ?? badge.badgeId,
      image: null,
      category: null,
      title: "Earned badge",
      state: "earned",
      earnedAt: badge.earnedAt,
      progress: null,
    }),
  );

  return [...known, ...extra];
}

/** The badge closest to unlocking: the furthest-along in progress, else the first locked. */
export function nextPossibleBadge(badges: AchievementBadge[]): AchievementBadge | null {
  const inProgress = badges
    .filter((badge) => badge.state === "progress" && badge.progress)
    .sort(
      (left, right) =>
        right.progress!.current / right.progress!.target - left.progress!.current / left.progress!.target,
    );

  return inProgress[0] ?? badges.find((badge) => badge.state === "locked") ?? null;
}

const STATE_ORDER: Record<AchievementState, number> = { earned: 0, progress: 1, locked: 2 };

/** The wall's order: earned, then in progress, then locked, catalogue order within each. */
export function wallOrder(badges: AchievementBadge[]): AchievementBadge[] {
  return badges
    .map((badge, index) => ({ badge, index }))
    .sort((left, right) => STATE_ORDER[left.badge.state] - STATE_ORDER[right.badge.state] || left.index - right.index)
    .map(({ badge }) => badge);
}
