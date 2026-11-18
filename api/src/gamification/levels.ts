import { levelNameTokens, type LevelName } from "@contentual/content-engine-vocabulary";

// Lifetime distinct completed tasks -> level. Thresholds live here, not in a
// migration, so they are retunable without one: `user_level` stores the
// level a user reached, never the threshold that got them there.
export interface LevelThreshold {
  readonly level: LevelName;
  readonly minCompletions: number;
}

export const levelThresholds: readonly LevelThreshold[] = [
  { level: levelNameTokens.bronze, minCompletions: 0 },
  { level: levelNameTokens.silver, minCompletions: 10 },
  { level: levelNameTokens.gold, minCompletions: 25 },
  { level: levelNameTokens.platinum, minCompletions: 50 },
  { level: levelNameTokens.champion, minCompletions: 100 },
];

export const baseLevel: LevelName = levelThresholds[0].level;

export function levelForCompletions(lifetimeTaskCompletions: number): LevelName {
  const completions = Math.max(0, lifetimeTaskCompletions);
  let level = baseLevel;

  for (const threshold of levelThresholds) {
    if (completions >= threshold.minCompletions) {
      level = threshold.level;
    }
  }

  return level;
}
