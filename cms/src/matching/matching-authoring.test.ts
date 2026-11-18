import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchingOperatorTokens } from "@contentual/programme-matching-vocabulary";
import { relationshipSourceId } from "../payload-values";
import {
  validateMatchingSetupForPublish,
  type AuthoredMatchingRule,
  type ProgrammeTargetLookup,
} from "./matching-authoring";

// Publication is refused for every case in the specification's blocker list.
// These tests are written against the operator-facing message rather than an
// error code, because the message is the deliverable: "a failed publication
// must identify the exact invalid rule or condition in plain language".

const LIVE = "programme-live";
const RETIRED = "programme-retired";

const liveTarget = {
  programmeKey: "first-take",
  programmeVersionId: "first-take@v1",
  sourceDocumentId: "programme-first-take",
  sourceUpdatedAt: "2026-08-27T10:00:00.000Z",
  snapshot: {
    programme: {
      id: "programme-first-take",
      key: "first-take",
      title: "First Take",
      description: null,
      access: "open",
      durationDays: null,
      experienceLevel: null,
      difficulty: null,
      track: null,
      founderVideoUrl: null,
      expectations: null,
      ctaText: null,
      milestones: [],
      insightMoments: [],
    },
    modules: [],
    lessons: [],
    tasks: [],
  },
};

const programmes: ProgrammeTargetLookup = {
  resolve: async (reference) =>
    relationshipSourceId(reference) === LIVE ? liveTarget : null,
  resolveKey: async (programmeKey) =>
    programmeKey === liveTarget.programmeKey ? liveTarget : null,
};

function fallbackRule(
  overrides: Partial<AuthoredMatchingRule> = {},
): AuthoredMatchingRule {
  return {
    id: "rule-fallback",
    name: "Everyone else",
    programme: LIVE,
    active: true,
    priority: null,
    fallback: true,
    explanation: "First Take is where every creator starts.",
    conditions: [],
    ...overrides,
  };
}

function normalRule(
  overrides: Partial<AuthoredMatchingRule> = {},
): AuthoredMatchingRule {
  return {
    id: "rule-daily",
    name: "Daily posters",
    programme: LIVE,
    active: true,
    priority: 100,
    fallback: false,
    explanation: "Creators already posting daily.",
    conditions: [
      {
        field: "currentPostingFrequency",
        operator: matchingOperatorTokens.gte,
        acceptedValues: ["Daily"],
      },
    ],
    ...overrides,
  };
}

async function publishable(rules: AuthoredMatchingRule[]) {
  return validateMatchingSetupForPublish(
    { label: "Launch setup", rules },
    programmes,
  );
}

async function refusalFor(rules: AuthoredMatchingRule[]): Promise<string> {
  const result = await publishable(rules);
  assert.ok(!result.valid, "expected publication to be refused");
  return result.errors.map((error) => error.message).join("\n");
}

describe("validateMatchingSetupForPublish", () => {
  it("accepts a setup with one fallback and one normal rule", async () => {
    const result = await publishable([normalRule(), fallbackRule()]);

    assert.ok(result.valid);
    assert.deepEqual(
      result.rules.map((rule) => rule.id),
      ["rule-daily", "rule-fallback"],
      "authoring order is preserved; the evaluator does its own ordering",
    );
    assert.equal(result.rules[0].programmeKey, "first-take");
    assert.equal(result.rules[0].programmeVersionId, "first-take@v1");
  });

  it("accepts the initial rollout shape: a fallback and no normal rules", async () => {
    const result = await publishable([fallbackRule()]);

    assert.ok(result.valid);
    assert.equal(result.rules.length, 1);
    assert.equal(result.rules[0].fallback, true);
  });

  it("refuses a rule that references a question users are never asked", async () => {
    assert.match(
      await refusalFor([
        normalRule({
          conditions: [
            { field: "milestone", operator: "equals", acceptedValues: ["x"] },
          ],
        }),
        fallbackRule(),
      ]),
      /Rule "Daily posters", condition 1: milestone is not a matching question/,
    );
  });

  it("refuses an answer users cannot select", async () => {
    assert.match(
      await refusalFor([
        normalRule({
          conditions: [
            {
              field: "userType",
              operator: "equals",
              acceptedValues: ["Astronaut"],
            },
          ],
        }),
        fallbackRule(),
      ]),
      /condition 1: "Astronaut" is not an answer users can select/,
    );
  });

  it("refuses a comparison the question does not support", async () => {
    assert.match(
      await refusalFor([
        normalRule({
          conditions: [
            {
              field: "userType",
              operator: "contains_all",
              acceptedValues: ["Business Owner"],
            },
          ],
        }),
        fallbackRule(),
      ]),
      /condition 1: contains_all is not valid for userType/,
    );
  });

  it("names every broken condition, not only the first", async () => {
    const message = await refusalFor([
      normalRule({
        conditions: [
          { field: "nope", operator: "equals", acceptedValues: ["x"] },
          {
            field: "userType",
            operator: "equals",
            acceptedValues: ["Astronaut"],
          },
        ],
      }),
      fallbackRule(),
    ]);

    assert.match(message, /condition 1:/);
    assert.match(message, /condition 2:/);
  });

  it("refuses duplicate priorities among active normal rules", async () => {
    assert.match(
      await refusalFor([
        normalRule(),
        normalRule({ id: "rule-other", name: "Other route" }),
        fallbackRule(),
      ]),
      /priority 100 is already used by another active rule/,
    );
  });

  it("refuses a setup with no fallback", async () => {
    assert.match(
      await refusalFor([normalRule()]),
      /exactly one fallback rule; found 0/,
    );
  });

  it("refuses a setup with two fallbacks", async () => {
    assert.match(
      await refusalFor([
        fallbackRule(),
        fallbackRule({ id: "rule-fallback-2", name: "Second catch-all" }),
      ]),
      /exactly one fallback rule; found 2/,
    );
  });

  it("refuses a rule targeting a programme that cannot take new users", async () => {
    assert.match(
      await refusalFor([
        normalRule({ programme: RETIRED }),
        fallbackRule(),
      ]),
      /Rule "Daily posters": choose a live programme with published content/,
    );
  });

  it("refuses a rule with no programme selected at all", async () => {
    assert.match(
      await refusalFor([normalRule({ programme: null }), fallbackRule()]),
      /choose a live programme with published content/,
    );
  });

  it("refuses a normal rule with no conditions", async () => {
    assert.match(
      await refusalFor([normalRule({ conditions: [] }), fallbackRule()]),
      /a rule needs at least one condition/,
    );
  });

  it("refuses a normal rule with no priority", async () => {
    assert.match(
      await refusalFor([normalRule({ priority: null }), fallbackRule()]),
      /Rule "Daily posters": a priority is required, as a whole number of 1 or more/,
    );
  });

  it("refuses a non-positive or fractional priority", async () => {
    assert.match(
      await refusalFor([normalRule({ priority: 0 }), fallbackRule()]),
      /a priority is required/,
    );
    assert.match(
      await refusalFor([normalRule({ priority: 2.5 }), fallbackRule()]),
      /a priority is required/,
    );
  });

  it("refuses a rule with no explanation", async () => {
    assert.match(
      await refusalFor([normalRule({ explanation: "   " }), fallbackRule()]),
      /an explanation is required/,
    );
  });

  it("refuses a setup with no name", async () => {
    const result = await validateMatchingSetupForPublish(
      { label: "  ", rules: [fallbackRule()] },
      programmes,
    );

    assert.ok(!result.valid);
    assert.match(result.errors[0].message, /Give this matching setup a name/);
  });

  it("refuses a setup whose rules are not a list", async () => {
    const result = await validateMatchingSetupForPublish(
      { label: "Launch setup", rules: "not a list" },
      programmes,
    );

    assert.ok(!result.valid);
    assert.match(result.errors[0].message, /needs a list of rules/);
  });

  it("addresses each error to the rule an operator has to fix", async () => {
    const result = await publishable([
      normalRule({ explanation: "" }),
      fallbackRule(),
    ]);

    assert.ok(!result.valid);
    assert.equal(result.errors[0].ruleLabel, "Daily posters");
    assert.equal(result.errors[0].field, "rules");
  });

  it("falls back to a positional label when a rule has no name", async () => {
    assert.match(
      await refusalFor([
        normalRule({ name: "", explanation: "" }),
        fallbackRule(),
      ]),
      /Rule "Rule 1": an explanation is required/,
    );
  });

  it("keeps a deactivated rule out of the priority collision check", async () => {
    const result = await publishable([
      normalRule(),
      normalRule({ id: "rule-parked", name: "Parked", active: false }),
      fallbackRule(),
    ]);

    assert.ok(result.valid);
    assert.equal(result.rules[1].active, false);
    assert.equal(result.rules[1].priority, 100, "its priority is kept, not cleared");
  });

  it("keeps the fallback active even when the author left the flag off", async () => {
    const result = await publishable([fallbackRule({ active: false })]);

    assert.ok(result.valid);
    assert.equal(
      result.rules[0].active,
      true,
      "an inactive fallback would leave some user unassigned",
    );
  });

  it("holds setup-wide errors back until every rule is individually sound", async () => {
    // Two rules share priority 100 *and* one has no explanation. Reporting the
    // collision here would point the author at a rule whose real problem is
    // something else.
    const message = await refusalFor([
      normalRule({ explanation: "" }),
      normalRule({ id: "rule-other", name: "Other route" }),
      fallbackRule(),
    ]);

    assert.match(message, /an explanation is required/);
    assert.doesNotMatch(message, /already used by another active rule/);
  });
});
