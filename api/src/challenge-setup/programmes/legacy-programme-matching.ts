import type { MatchingProfile } from "@contentual/programme-matching-vocabulary";

/**
 * The release-time matcher kept alive for the shadow window and emergency
 * rollback only. It is intentionally isolated from the CMS matcher and can be
 * deleted once the published snapshot has passed its cutover review.
 */
export interface LegacyProgrammeSelection {
  programmeKey: string;
  algorithmVersion: string;
  ruleId: string;
  ruleName: string;
  explanation: string;
  fallbackUsed: boolean;
}

export const LEGACY_PROGRAMME_MATCHING_VERSION = "phase-1-v1";
export const LEGACY_PROGRAMME_KEY = "first-take";
export const LEGACY_PROGRAMME_RULE_ID = "first-take-catch-all";

/**
 * This is the exact released decision tree: one explicit catch-all and no
 * conditional branches. Keeping the decision separate from content lookup
 * means the rollback path can select the old audience logic while still
 * assigning an immutable programme content version.
 */
export function evaluateLegacyProgramme(
  _profile: MatchingProfile,
): LegacyProgrammeSelection {
  return {
    programmeKey: LEGACY_PROGRAMME_KEY,
    algorithmVersion: LEGACY_PROGRAMME_MATCHING_VERSION,
    ruleId: LEGACY_PROGRAMME_RULE_ID,
    ruleName: "First Take catch-all",
    explanation: "The released matcher assigned every creator to First Take.",
    fallbackUsed: true,
  };
}
