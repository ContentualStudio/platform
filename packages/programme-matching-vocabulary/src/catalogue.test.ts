import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptedValuesFor,
  canonicalPlatform,
  matchingFieldCatalogue,
  matchingFields,
  matchingFieldTokens,
  matchingOperatorTokens,
  operatorsFor,
  platforms,
} from "./catalogue.js";

describe("matching field catalogue", () => {
  it("offers every structured onboarding answer matching is allowed to read", () => {
    assert.deepEqual(
      [...matchingFields].sort(),
      [
        "biggestChallenge",
        "currentPostingFrequency",
        "desiredPostingFrequency",
        "experienceLevel",
        "followerRange",
        "mainGoal",
        "nicheDefined",
        "platformConnectionStatus",
        "preferredContentType",
        "primaryPlatform",
        "selectedPlatforms",
        "userType",
        "weeklyCommitment",
      ],
      "the catalogue is the whole matching surface; adding a field here is a product decision",
    );
  });

  it("makes free text and scheduling answers unnameable", () => {
    for (const forbidden of [
      "milestone",
      "name",
      "region",
      "timezone",
      "availableDays",
      "sawTestimonial",
    ]) {
      assert.ok(
        !(matchingFields as readonly string[]).includes(forbidden),
        `${forbidden} must not be authorable`,
      );
    }
  });

  it("keeps current and desired posting frequency as separate fields", () => {
    assert.notEqual(
      matchingFieldCatalogue.currentPostingFrequency.values,
      matchingFieldCatalogue.desiredPostingFrequency.values,
    );
  });

  it("offers only membership comparisons on an unordered enum", () => {
    assert.deepEqual(operatorsFor(matchingFieldTokens.userType), [
      matchingOperatorTokens.equals,
      matchingOperatorTokens.oneOf,
    ]);
  });

  it("offers range comparisons only where an ordering is declared", () => {
    assert.ok(
      operatorsFor(matchingFieldTokens.followerRange).includes(
        matchingOperatorTokens.gte,
      ),
    );
    assert.ok(
      !operatorsFor(matchingFieldTokens.experienceLevel).includes(
        matchingOperatorTokens.gte,
      ),
      "experience level ends in On-and-off, which is not a rung on a ladder",
    );
  });

  it("offers any/all/none only on the multi-select field", () => {
    assert.deepEqual(operatorsFor(matchingFieldTokens.selectedPlatforms), [
      matchingOperatorTokens.containsAny,
      matchingOperatorTokens.containsAll,
      matchingOperatorTokens.containsNone,
    ]);
  });

  it("gives an integer field bounds instead of a pick list", () => {
    assert.deepEqual(acceptedValuesFor(matchingFieldTokens.weeklyCommitment), []);
    assert.equal(matchingFieldCatalogue.weeklyCommitment.min, 1);
    assert.equal(matchingFieldCatalogue.weeklyCommitment.max, 7);
  });

  it("declares an ordering for every ordered field", () => {
    for (const field of matchingFields) {
      const definition = matchingFieldCatalogue[field];
      const hasOrdering = definition.kind === "ordered_enum";
      assert.equal(
        Boolean(definition.ascending),
        hasOrdering,
        `${field} ordering presence must match its kind`,
      );
    }
  });

  it("ranks cadence from least to most frequent", () => {
    assert.deepEqual(
      matchingFieldCatalogue.currentPostingFrequency.ascending?.at(-1),
      "Daily",
    );
    assert.deepEqual(
      matchingFieldCatalogue.currentPostingFrequency.ascending?.at(0),
      "Rarely",
    );
  });
});

describe("canonicalPlatform", () => {
  it("folds the stage 1 spelling onto the canonical token", () => {
    assert.equal(canonicalPlatform("X / Twitter"), "X (Twitter)");
  });

  it("passes canonical tokens through untouched", () => {
    for (const platform of platforms) {
      assert.equal(canonicalPlatform(platform), platform);
    }
  });

  it("refuses to guess at an unknown value", () => {
    assert.equal(canonicalPlatform("Threads"), null);
    assert.equal(canonicalPlatform(null), null);
    assert.equal(canonicalPlatform(42), null);
  });
});
