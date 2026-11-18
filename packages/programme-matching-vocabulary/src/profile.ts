import { z } from "zod";
import {
  contentTypes,
  biggestChallenges,
  experienceLevels,
  followerRanges,
  mainGoals,
  matchingFieldTokens,
  nicheStatuses,
  platformConnectionStatuses,
  platformSchema,
  postingFrequencies,
  postingGoals,
  userTypes,
} from "./catalogue.js";

// The evaluator's whole view of a user. Building this object is the moment
// free text is dropped: an adapter can only fill the keys named below, so a
// `milestone` or a region cannot reach a rule even by accident.
//
// Optional fields are `null`, never absent and never widened to `string`. A
// missing answer is a fact the evaluator has to act on — it fails the rule
// that reads it — so it must arrive as a value, not as an undefined lookup.
export const matchingProfileSchema = z
  .object({
    [matchingFieldTokens.userType]: z.enum(userTypes),
    [matchingFieldTokens.selectedPlatforms]: z.array(platformSchema),
    [matchingFieldTokens.primaryPlatform]: platformSchema.nullable(),
    [matchingFieldTokens.experienceLevel]: z.enum(experienceLevels),
    [matchingFieldTokens.currentPostingFrequency]: z.enum(postingFrequencies),
    [matchingFieldTokens.mainGoal]: z.enum(mainGoals),
    [matchingFieldTokens.biggestChallenge]: z.enum(biggestChallenges),
    [matchingFieldTokens.desiredPostingFrequency]: z.enum(postingGoals),
    [matchingFieldTokens.weeklyCommitment]: z.number().int().min(1).max(7),
    [matchingFieldTokens.nicheDefined]: z.enum(nicheStatuses),
    [matchingFieldTokens.preferredContentType]: z.enum(contentTypes),
    [matchingFieldTokens.followerRange]: z.enum(followerRanges),
    [matchingFieldTokens.platformConnectionStatus]: z.enum(
      platformConnectionStatuses,
    ),
  })
  // Strict, so an adapter that starts smuggling an extra answer through fails
  // loudly here instead of shipping an unauthorable field to rule authors.
  .strict();

export type MatchingProfile = z.infer<typeof matchingProfileSchema>;
