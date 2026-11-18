import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchingFieldTokens, matchingOperatorTokens } from "./catalogue.js";
import { publishedMatchingSetupSchema } from "./snapshot.js";

const fallback = {
  id: "rule-fallback",
  name: "Everyone else",
  programmeKey: "programme-first-take",
  programmeVersionId: "first-take-v1",
  active: true,
  priority: null,
  fallback: true,
  explanation: "The starting programme.",
  conditions: [],
};

const normal = {
  id: "rule-1",
  name: "Daily posters",
  programmeKey: "programme-momentum",
  programmeVersionId: "momentum-v1",
  active: true,
  priority: 100,
  fallback: false,
  explanation: "Creators already posting daily.",
  conditions: [
    {
      field: matchingFieldTokens.currentPostingFrequency,
      operator: matchingOperatorTokens.gte,
      acceptedValues: ["Daily"],
    },
  ],
};

function parse(rules: unknown[]) {
  return publishedMatchingSetupSchema.safeParse({
    setupVersionId: "setup-v1",
    publishedAt: "2026-08-27T00:00:00.000Z",
    rules,
  });
}

function reasons(rules: unknown[]): string {
  const result = parse(rules);
  assert.ok(!result.success, "expected the setup to be rejected");
  return result.error.issues.map((issue) => issue.message).join("\n");
}

describe("publishedMatchingSetupSchema", () => {
  it("accepts a setup with one fallback and one normal rule", () => {
    assert.equal(parse([normal, fallback]).success, true);
  });

  it("accepts the initial rollout shape: a fallback and nothing else", () => {
    assert.equal(parse([fallback]).success, true);
  });

  it("refuses a setup with no fallback", () => {
    assert.match(reasons([normal]), /exactly one fallback rule; found 0/);
  });

  it("refuses a setup with two fallbacks", () => {
    assert.match(
      reasons([fallback, { ...fallback, id: "rule-fallback-2" }]),
      /exactly one fallback rule; found 2/,
    );
  });

  it("refuses duplicate priorities among active normal rules", () => {
    assert.match(
      reasons([normal, { ...normal, id: "rule-2" }, fallback]),
      /priority 100 is already used by another active rule/,
    );
  });

  it("allows a deactivated rule to keep a priority an active rule uses", () => {
    assert.equal(
      parse([normal, { ...normal, id: "rule-2", active: false }, fallback])
        .success,
      true,
    );
  });

  it("refuses a normal rule with no conditions", () => {
    assert.match(
      reasons([{ ...normal, conditions: [] }, fallback]),
      /a rule needs at least one condition/,
    );
  });

  it("refuses a fallback that carries conditions or a priority", () => {
    const message = reasons([
      { ...fallback, conditions: normal.conditions, priority: 5 },
    ]);

    assert.match(message, /the fallback cannot have conditions/);
    assert.match(message, /the fallback cannot have a priority/);
  });

  it("refuses a rule whose condition names an unauthorable question", () => {
    assert.match(
      reasons([
        {
          ...normal,
          conditions: [
            {
              field: "milestone",
              operator: matchingOperatorTokens.equals,
              acceptedValues: ["anything"],
            },
          ],
        },
        fallback,
      ]),
      /invalid|expected/i,
    );
  });

  it("refuses a rule whose condition uses an unselectable answer", () => {
    assert.match(
      reasons([
        {
          ...normal,
          conditions: [
            {
              field: matchingFieldTokens.userType,
              operator: matchingOperatorTokens.equals,
              acceptedValues: ["Astronaut"],
            },
          ],
        },
        fallback,
      ]),
      /not an answer users can select/,
    );
  });

  it("refuses a rule missing its explanation", () => {
    assert.equal(parse([{ ...normal, explanation: "  " }, fallback]).success, false);
  });

  it("refuses a rule with no programme version pinned", () => {
    assert.equal(
      parse([{ ...normal, programmeVersionId: "" }, fallback]).success,
      false,
    );
  });

  it("refuses duplicate rule ids", () => {
    assert.match(reasons([normal, { ...normal }, fallback]), /Duplicate rule id/);
  });

  it("refuses a non-positive priority", () => {
    assert.equal(parse([{ ...normal, priority: 0 }, fallback]).success, false);
  });
});
