import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchingFieldTokens, matchingOperatorTokens } from "./catalogue.js";
import { evaluateMatchingSnapshot } from "./evaluator.js";
import type { MatchingProfile } from "./profile.js";
import type {
  PublishedMatchingRule,
  PublishedMatchingSetup,
} from "./snapshot.js";

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

const fallbackRule: PublishedMatchingRule = {
  id: "rule-fallback",
  name: "Everyone else",
  programmeKey: "programme-first-take",
  programmeVersionId: "first-take-v1",
  active: true,
  priority: null,
  fallback: true,
  explanation: "The starting programme for creators we have no stronger signal for.",
  conditions: [],
};

function rule(
  overrides: Partial<PublishedMatchingRule> &
    Pick<PublishedMatchingRule, "id" | "priority">,
): PublishedMatchingRule {
  return {
    name: `Rule ${overrides.id}`,
    programmeKey: `programme-${overrides.id}`,
    programmeVersionId: `${overrides.id}-v1`,
    active: true,
    fallback: false,
    explanation: "Because the answers said so.",
    conditions: [
      {
        field: matchingFieldTokens.userType,
        operator: matchingOperatorTokens.equals,
        acceptedValues: ["Independent Creator"],
      },
    ],
    ...overrides,
  };
}

function setup(rules: PublishedMatchingRule[]): PublishedMatchingSetup {
  return {
    setupVersionId: "setup-v1",
    publishedAt: "2026-08-27T00:00:00.000Z",
    rules,
  };
}

describe("evaluateMatchingSnapshot", () => {
  it("selects the highest-priority qualifying rule, not the first listed", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({ id: "low", priority: 10 }),
        rule({ id: "high", priority: 90 }),
        fallbackRule,
      ]),
    );

    assert.equal(trace.selectedRuleId, "high");
    assert.equal(trace.selectedProgrammeVersionId, "high-v1");
    assert.equal(trace.fallbackUsed, false);
  });

  it("ANDs the conditions inside one rule", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({
          id: "both",
          priority: 50,
          conditions: [
            {
              field: matchingFieldTokens.userType,
              operator: matchingOperatorTokens.equals,
              acceptedValues: ["Independent Creator"],
            },
            {
              field: matchingFieldTokens.followerRange,
              operator: matchingOperatorTokens.gte,
              acceptedValues: ["5,001–10,000"],
            },
          ],
        }),
        fallbackRule,
      ]),
    );

    assert.equal(trace.fallbackUsed, true);
    assert.deepEqual(
      trace.considered[0].conditions.map((condition) => condition.passed),
      [true, false],
      "every condition is reported, not just the first failure",
    );
    assert.deepEqual(
      trace.considered[0].conditions.map((condition) => condition.index),
      [1, 2],
      "trace positions match the one-based CMS labels",
    );
  });

  it("falls back when no normal rule qualifies", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({
          id: "business",
          priority: 40,
          conditions: [
            {
              field: matchingFieldTokens.userType,
              operator: matchingOperatorTokens.equals,
              acceptedValues: ["Business Owner"],
            },
          ],
        }),
        fallbackRule,
      ]),
    );

    assert.equal(trace.fallbackUsed, true);
    assert.equal(trace.selectedRuleId, "rule-fallback");
    assert.equal(trace.selectedProgrammeKey, "programme-first-take");
    assert.deepEqual(trace.qualifyingRuleIds, []);
  });

  it("assigns the fallback when a setup has no active normal rules at all", () => {
    const trace = evaluateMatchingSnapshot(profile, setup([fallbackRule]));

    assert.equal(trace.selectedProgrammeKey, "programme-first-take");
    assert.equal(trace.multipleRulesQualified, false);
    assert.deepEqual(trace.considered, []);
  });

  it("skips deactivated rules without discarding their priority", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({ id: "parked", priority: 99, active: false }),
        rule({ id: "live", priority: 10 }),
        fallbackRule,
      ]),
    );

    assert.equal(trace.selectedRuleId, "live");
    assert.deepEqual(
      trace.considered.map((considered) => considered.ruleId),
      ["live"],
    );
  });

  it("reports overlap when more than one rule qualifies", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({ id: "one", priority: 20 }),
        rule({ id: "two", priority: 30 }),
        fallbackRule,
      ]),
    );

    assert.equal(trace.multipleRulesQualified, true);
    assert.deepEqual(trace.qualifyingRuleIds, ["two", "one"]);
    assert.equal(trace.selectedRuleId, "two");
  });

  it("is deterministic for the same profile and snapshot", () => {
    const snapshot = setup([
      rule({ id: "a", priority: 5 }),
      rule({ id: "b", priority: 6 }),
      fallbackRule,
    ]);

    assert.deepEqual(
      evaluateMatchingSnapshot(profile, snapshot),
      evaluateMatchingSnapshot(profile, snapshot),
    );
  });

  it("fails closed when the snapshot has no fallback", () => {
    assert.throws(
      () => evaluateMatchingSnapshot(profile, setup([rule({ id: "only", priority: 1 })])),
      /has no fallback rule/,
    );
  });

  it("carries the winning rule's authored explanation into the trace", () => {
    const trace = evaluateMatchingSnapshot(
      profile,
      setup([
        rule({
          id: "explained",
          priority: 3,
          explanation: "Weekly posters who are still finding a niche.",
        }),
        fallbackRule,
      ]),
    );

    assert.equal(
      trace.explanation,
      "Weekly posters who are still finding a niche.",
    );
  });
});
