import {
  canonicalPlatform,
  matchingProfileSchema,
  platformConnectionStatusTokens,
  type MatchingProfile,
  type Platform,
} from "@contentual/programme-matching-vocabulary";
import type { Stage1AnswersInput } from "../../profile/profile.schemas";
import type { Stage2AnswersInput } from "../challenge-setup.schemas";

export interface MatchingProfileSource {
  stage1: Stage1AnswersInput;
  // The API completion path supplies the full parsed answer. The optional
  // property keeps pre-cutover fixtures and replayed legacy rows representable
  // without weakening the full request schema: a two-platform row with no
  // primary still resolves to null and cannot match a primaryPlatform rule.
  stage2: Omit<Stage2AnswersInput, "primaryPlatform"> & {
    primaryPlatform?: Stage2AnswersInput["primaryPlatform"];
  };
  // Nullable until Stage 2 collects it explicitly. A one-platform selection
  // implies its own primary, so this is only genuinely unknown for legacy
  // two-platform rows.
  primaryPlatform?: string | null;
}

export type MatchingProfileResult =
  | { valid: true; profile: MatchingProfile }
  | { valid: false; reason: string };

// Stage 2's platform list is the one matching reads: it is the answer the user
// gave to "which platforms is this challenge for", where Stage 1's is a
// profile-wide preference. Unknown tokens are dropped rather than passed
// through, so a rule can never match a platform nobody can select.
function selectedPlatforms(
  stage2: Pick<Stage2AnswersInput, "platforms">,
): Platform[] {
  return stage2.platforms
    .map((value) => canonicalPlatform(value))
    .filter((value): value is Platform => value !== null);
}

// A single selection is its own primary — asking the user to confirm it would
// be a question with one answer. Two selections need an explicit choice, and
// until one is recorded the field is honestly absent: every rule that reads it
// fails, which is the specification's "missing values do not match by
// inference".
function resolvePrimary(
  explicit: string | null | undefined,
  selected: readonly Platform[],
): Platform | null {
  const chosen = canonicalPlatform(explicit);

  if (chosen && selected.includes(chosen)) {
    return chosen;
  }

  return selected.length === 1 ? selected[0] : null;
}

/**
 * Builds the evaluator's view of a user from the two validated onboarding
 * stages.
 *
 * This function is where free text stops. `MatchingProfile` is a strict schema
 * with no key for `milestone`, `name`, `region`, `timezone` or `availableDays`,
 * so smuggling one through would fail to parse here rather than reach a rule
 * author — or an analytics payload.
 */
export function buildMatchingProfile(
  source: MatchingProfileSource,
): MatchingProfileResult {
  const { stage1, stage2 } = source;
  const selected = selectedPlatforms(stage2);
  const parsed = matchingProfileSchema.safeParse({
    userType: stage1.userType,
    selectedPlatforms: selected,
    primaryPlatform: resolvePrimary(
      source.primaryPlatform ?? source.stage2.primaryPlatform,
      selected,
    ),
    experienceLevel: stage1.experienceLevel,
    // Renamed on the way in, not in storage. The two cadence answers are
    // distinct signals and the rule vocabulary says so; the columns keep the
    // names the questionnaire gave them.
    currentPostingFrequency: stage1.postingFrequency,
    desiredPostingFrequency: stage2.postingGoal,
    mainGoal: stage1.mainGoal,
    biggestChallenge: stage1.biggestChallenge,
    weeklyCommitment: stage2.weeklyCommitment,
    nicheDefined: stage2.nicheDefined,
    preferredContentType: stage2.contentType,
    followerRange: stage2.followerRange,
    platformConnectionStatus: stage2.instagramConnected
      ? platformConnectionStatusTokens.connected
      : platformConnectionStatusTokens.notConnected,
  });

  if (!parsed.success) {
    return {
      valid: false,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  return { valid: true, profile: parsed.data };
}
