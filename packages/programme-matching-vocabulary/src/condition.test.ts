import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchingFieldTokens, matchingOperatorTokens } from "./catalogue.js";
import {
  evaluateMatchingCondition,
  validateMatchingCondition,
  type PublishedMatchingCondition,
} from "./condition.js";
import type { MatchingProfile } from "./profile.js";

const profile: MatchingProfile = {
  userType: "Independent Creator",
  selectedPlatforms: ["Instagram", "TikTok"],
  primaryPlatform: "Instagram",
  experienceLevel: "Intermediate (6–18 months)",
  currentPostingFrequency: "Weekly",
  mainGoal: "Grow my audience",
  biggestChallenge: "Staying consistent",
  desiredPostingFrequency: "3–4 times per week",
  weeklyCommitment: 4,
  nicheDefined: "Partially",
  preferredContentType: "Educational",
  followerRange: "501–1,000",
  platformConnectionStatus: "connected",
};

function condition(
  overrides: Partial<PublishedMatchingCondition> & {
    field: PublishedMatchingCondition["field"];
    operator: PublishedMatchingCondition["operator"];
    acceptedValues: PublishedMatchingCondition["acceptedValues"];
  },
): PublishedMatchingCondition {
  return overrides;
}

function valid(input: {
  field: unknown;
  operator: unknown;
  acceptedValues: unknown;
}): PublishedMatchingCondition {
  const result = validateMatchingCondition(input);
  assert.ok(result.valid, `expected a valid condition, got: ${JSON.stringify(result)}`);
  return result.condition;
}

function rejection(input: {
  field: unknown;
  operator: unknown;
  acceptedValues: unknown;
}): string {
  const result = validateMatchingCondition(input);
  assert.ok(!result.valid, "expected the condition to be rejected");
  return result.reason;
}

describe("validateMatchingCondition", () => {
  it("accepts a well-formed condition", () => {
    const accepted = valid({
      field: matchingFieldTokens.userType,
      operator: matchingOperatorTokens.oneOf,
      acceptedValues: ["Business Owner", "Marketing Manager"],
    });

    assert.equal(accepted.field, "userType");
    assert.deepEqual(accepted.acceptedValues, [
      "Business Owner",
      "Marketing Manager",
    ]);
  });

  it("refuses a question that is not in the catalogue", () => {
    assert.match(
      rejection({
        field: "milestone",
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["anything"],
      }),
      /not a matching question/,
    );
  });

  it("refuses an answer users cannot select", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.userType,
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["Astronaut"],
      }),
      /not an answer users can select/,
    );
  });

  it("refuses a comparison the field does not support", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.userType,
        operator: matchingOperatorTokens.containsAll,
        acceptedValues: ["Business Owner"],
      }),
      /contains_all is not valid for userType/,
    );
  });

  it("refuses ranking an unordered enum", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.experienceLevel,
        operator: matchingOperatorTokens.gte,
        acceptedValues: ["Intermediate (6–18 months)"],
      }),
      /gte is not valid for experienceLevel/,
    );
  });

  it("refuses a second accepted value on a single-valued comparison", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.userType,
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["Business Owner", "Marketing Manager"],
      }),
      /use one_of/,
    );
  });

  it("refuses an empty accepted-value list", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.selectedPlatforms,
        operator: matchingOperatorTokens.containsAny,
        acceptedValues: [],
      }),
      /at least one accepted answer/,
    );
  });

  it("refuses an integer outside the questionnaire's own bounds", () => {
    assert.match(
      rejection({
        field: matchingFieldTokens.weeklyCommitment,
        operator: matchingOperatorTokens.gte,
        acceptedValues: [9],
      }),
      /outside the allowed range 1–7/,
    );
  });
});

describe("evaluateMatchingCondition", () => {
  it("passes an equals match and names the answer in the reason", () => {
    const outcome = evaluateMatchingCondition(
      profile,
      condition({
        field: matchingFieldTokens.userType,
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["Independent Creator"],
      }),
    );

    assert.equal(outcome.passed, true);
    assert.match(outcome.reason, /User type is "Independent Creator"/);
  });

  it("ORs the accepted values of one condition", () => {
    const outcome = evaluateMatchingCondition(
      profile,
      condition({
        field: matchingFieldTokens.nicheDefined,
        operator: matchingOperatorTokens.oneOf,
        acceptedValues: ["Yes", "Partially"],
      }),
    );

    assert.equal(outcome.passed, true);
  });

  it("ranks cadence by frequency, not by option order", () => {
    const atLeastWeekly = evaluateMatchingCondition(
      profile,
      condition({
        field: matchingFieldTokens.currentPostingFrequency,
        operator: matchingOperatorTokens.gte,
        acceptedValues: ["Weekly"],
      }),
    );
    const atLeastDaily = evaluateMatchingCondition(
      profile,
      condition({
        field: matchingFieldTokens.currentPostingFrequency,
        operator: matchingOperatorTokens.gte,
        acceptedValues: ["Daily"],
      }),
    );

    assert.equal(atLeastWeekly.passed, true);
    assert.equal(atLeastDaily.passed, false);
  });

  it("compares integers numerically", () => {
    assert.equal(
      evaluateMatchingCondition(
        profile,
        condition({
          field: matchingFieldTokens.weeklyCommitment,
          operator: matchingOperatorTokens.lte,
          acceptedValues: [4],
        }),
      ).passed,
      true,
    );
  });

  it("supports any / all / none over the selected platforms", () => {
    const any = condition({
      field: matchingFieldTokens.selectedPlatforms,
      operator: matchingOperatorTokens.containsAny,
      acceptedValues: ["YouTube", "TikTok"],
    });
    const all = condition({
      field: matchingFieldTokens.selectedPlatforms,
      operator: matchingOperatorTokens.containsAll,
      acceptedValues: ["Instagram", "YouTube"],
    });
    const none = condition({
      field: matchingFieldTokens.selectedPlatforms,
      operator: matchingOperatorTokens.containsNone,
      acceptedValues: ["LinkedIn"],
    });

    assert.equal(evaluateMatchingCondition(profile, any).passed, true);
    assert.equal(evaluateMatchingCondition(profile, all).passed, false);
    assert.equal(evaluateMatchingCondition(profile, none).passed, true);
  });

  it("reads the primary platform separately from the selected list", () => {
    assert.equal(
      evaluateMatchingCondition(
        profile,
        condition({
          field: matchingFieldTokens.primaryPlatform,
          operator: matchingOperatorTokens.equals,
          acceptedValues: ["TikTok"],
        }),
      ).passed,
      false,
      "TikTok is selected but is not the primary platform",
    );
  });

  it("fails any condition whose answer is missing, including contains_none", () => {
    const withoutPrimary: MatchingProfile = {
      ...profile,
      primaryPlatform: null,
    };
    const outcome = evaluateMatchingCondition(
      withoutPrimary,
      condition({
        field: matchingFieldTokens.primaryPlatform,
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["Instagram"],
      }),
    );

    assert.equal(outcome.passed, false);
    assert.match(outcome.reason, /has no recorded answer/);
  });
});
