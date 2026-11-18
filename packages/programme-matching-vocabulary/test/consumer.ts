import {
  evaluateMatchingSnapshot,
  matchingFieldCatalogue,
  matchingFieldTokens,
  matchingOperatorTokens,
  type MatchingProfile,
  type MatchingTrace,
  type PublishedMatchingSetup,
} from "@contentual/programme-matching-vocabulary";

const profile: MatchingProfile = {
  userType: "Independent Creator",
  selectedPlatforms: ["Instagram"],
  primaryPlatform: "Instagram",
  experienceLevel: "On-and-off",
  currentPostingFrequency: "Rarely",
  mainGoal: "Be more consistent",
  biggestChallenge: "Staying consistent",
  desiredPostingFrequency: "Just getting started",
  weeklyCommitment: 3,
  nicheDefined: "Not yet",
  preferredContentType: "Educational",
  followerRange: "0–100",
  platformConnectionStatus: "not_connected",
};

const setup: PublishedMatchingSetup = {
  setupVersionId: "setup-1",
  publishedAt: "2026-08-27T00:00:00.000Z",
  rules: [
    {
      id: "fallback",
      name: "Everyone else",
      programmeKey: "programme-first-take",
      programmeVersionId: "first-take-v1",
      active: true,
      priority: null,
      fallback: true,
      explanation: "The starting programme.",
      conditions: [],
    },
  ],
};

const trace: MatchingTrace = evaluateMatchingSnapshot(profile, setup);
void trace.selectedProgrammeVersionId;

// The catalogue's field keys are the profile's keys. A drift between them must
// be a compile error here, not a runtime lookup that quietly reads undefined.
void matchingFieldCatalogue[matchingFieldTokens.followerRange].ascending;
void matchingOperatorTokens.containsNone;

// @ts-expect-error free text is not a matching field
void matchingFieldCatalogue.milestone;

const missingAnswer: MatchingProfile = {
  ...profile,
  // @ts-expect-error a missing optional answer is null, never undefined
  primaryPlatform: undefined,
};
void missingAnswer;
