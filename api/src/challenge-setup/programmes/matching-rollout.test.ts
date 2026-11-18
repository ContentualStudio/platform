import * as assert from "node:assert/strict";
import { test } from "node:test";
import { MatchingRollout, compareMatchingResults } from "./matching-rollout";

const profile = { selectedPlatforms: ["Instagram"] } as never;

const result = (programmeKey: string, programmeVersionId: string) => ({
  profile,
  trace: {
    setupVersionId: "setup",
    selectedRuleId: "rule",
    selectedRuleName: "Rule",
    selectedProgrammeKey: programmeKey,
    selectedProgrammeVersionId: programmeVersionId,
    explanation: "explanation",
    fallbackUsed: false,
    multipleRulesQualified: false,
    qualifyingRuleIds: [],
    considered: [],
  },
});

test("matching result comparison is redacted to selection identity", () => {
  const comparison = compareMatchingResults(
    result("starter", "legacy-v1"),
    result("growth", "pv-v2"),
  );

  assert.equal(comparison.match, false);
  assert.deepEqual(comparison.legacy, {
    programmeKey: "starter",
    programmeVersionId: "legacy-v1",
    fallbackUsed: false,
  });
  assert.deepEqual(comparison.published, {
    programmeKey: "growth",
    programmeVersionId: "pv-v2",
    fallbackUsed: false,
  });
  assert.equal("profile" in comparison, false);
  assert.equal("explanation" in comparison.legacy, false);
});

test("a new content snapshot for the same programme is not a matching mismatch", () => {
  const comparison = compareMatchingResults(
    result("starter", "legacy-v1"),
    result("starter", "published-v2"),
  );

  assert.equal(comparison.match, true);
  assert.equal(comparison.legacy.programmeVersionId, "legacy-v1");
  assert.equal(comparison.published.programmeVersionId, "published-v2");
});

test("shadow evaluates both paths, records a mismatch, and commits legacy result", async () => {
  const captures: unknown[] = [];
  const legacy = result("starter", "legacy-v1");
  const rollout = new MatchingRollout(
    { capture: (event) => captures.push(event) },
    { match: async () => legacy },
    "shadow",
  );

  const published = result("growth", "pv-v2");
  const selected = await rollout.evaluate(
    "user-1",
    profile,
    undefined,
    async () => published,
  );

  assert.equal(selected, legacy);
  assert.equal(captures.length, 1);
  const capture = captures[0] as { properties: Record<string, unknown> };
  assert.equal(capture.properties.match, false);
  assert.equal(capture.properties.legacyProgrammeKey, "starter");
  assert.equal("profile" in capture.properties, false);
});

test("shadow keeps the legacy result when the published observer fails", async () => {
  const captures: unknown[] = [];
  const legacy = result("starter", "legacy-v1");
  const rollout = new MatchingRollout(
    { capture: (event) => captures.push(event) },
    { match: async () => legacy },
    "shadow",
  );

  const selected = await rollout.evaluate(
    "user-1",
    profile,
    undefined,
    async () => {
      throw new Error("published setup unavailable");
    },
  );

  assert.equal(selected, legacy);
  assert.equal(captures.length, 1);
  const capture = captures[0] as { properties: Record<string, unknown> };
  assert.equal(capture.properties.legacyAvailable, true);
  assert.equal(capture.properties.publishedAvailable, false);
  assert.equal(capture.properties.legacyProgrammeKey, "starter");
  assert.equal("error" in capture.properties, false);
});

test("published mode does not invoke the legacy matcher", async () => {
  let legacyCalls = 0;
  const rollout = new MatchingRollout(
    { capture() {} },
    {
      match: async () => {
        legacyCalls += 1;
        return result("legacy", "legacy-v1");
      },
    },
    "published",
  );

  const published = result("starter", "pv-v2");
  assert.equal(
    await rollout.evaluate("user-1", profile, undefined, async () => published),
    published,
  );
  assert.equal(legacyCalls, 0);
});
