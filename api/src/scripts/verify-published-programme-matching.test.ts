import * as assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PublishedMatchingRule,
  PublishedMatchingSetup,
} from "@contentual/programme-matching-vocabulary";
import { MatchingConfigurationError } from "../challenge-setup/programmes/programme-matching.repository";
import { verifyPublishedMatching } from "./verify-published-programme-matching";

// The failure this guards against is a published setup that can return a
// programme with no published content behind it. Users would answer every
// question correctly and then be handed a 500 on completion, so it has to be
// catchable on demand — after a publish, before a release, during an incident.

// Publication of arbitrary test keys, with a record of what was asked. The real
// reader answers the same question against the content mirror.
function published(keys: string[]) {
  const available = new Set(keys);
  const lookups: string[] = [];

  return {
    lookups,
    findProgramme: async (key: string) => {
      lookups.push(key);
      return available.has(key) ? { key } : undefined;
    },
  };
}

function rule(
  overrides: Partial<PublishedMatchingRule> &
    Pick<PublishedMatchingRule, "id" | "programmeKey">,
): PublishedMatchingRule {
  return {
    name: overrides.id,
    programmeVersionId: `${overrides.programmeKey}-v1`,
    active: true,
    priority: 10,
    fallback: false,
    explanation: "Because the answers said so.",
    conditions: [
      {
        field: "userType",
        operator: "equals",
        acceptedValues: ["Independent Creator"],
      },
    ],
    ...overrides,
  };
}

function setupOf(rules: PublishedMatchingRule[]) {
  const setup: PublishedMatchingSetup = {
    setupVersionId: "setup-v3",
    publishedAt: "2026-08-27T00:00:00.000Z",
    rules,
  };

  return { loadActiveSetup: async () => setup };
}

const fallbackRule = rule({
  id: "fallback",
  programmeKey: "test-programme-a",
  fallback: true,
  priority: null,
  conditions: [],
});

test("reports the active version and every targeted programme", async () => {
  const report = await verifyPublishedMatching(
    setupOf([rule({ id: "r1", programmeKey: "test-programme-b" }), fallbackRule]),
    published(["test-programme-a", "test-programme-b"]),
  );

  assert.equal(report.ok, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.checked.sort(), [
    "test-programme-a",
    "test-programme-b",
  ]);
  assert.equal(report.setupVersionId, "setup-v3");
  assert.equal(report.fallbackProgrammeKey, "test-programme-a");
});

test("the fallback target is checked even with no normal rules", async () => {
  const content = published(["test-programme-a"]);

  const report = await verifyPublishedMatching(setupOf([fallbackRule]), content);

  assert.equal(report.ok, true);
  assert.deepEqual(content.lookups, ["test-programme-a"]);
});

test("every missing target is listed, not just the first", async () => {
  const report = await verifyPublishedMatching(
    setupOf([
      rule({ id: "r1", programmeKey: "test-programme-b" }),
      rule({ id: "r2", programmeKey: "test-programme-c", priority: 20 }),
      fallbackRule,
    ]),
    published(["test-programme-b"]),
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.missing.sort(), [
    "test-programme-a",
    "test-programme-c",
  ]);
});

test("a programme targeted by several rules is checked once", async () => {
  const content = published(["test-programme-a"]);

  await verifyPublishedMatching(
    setupOf([
      rule({ id: "r1", programmeKey: "test-programme-a" }),
      rule({ id: "r2", programmeKey: "test-programme-a", priority: 20 }),
      fallbackRule,
    ]),
    content,
  );

  assert.deepEqual(content.lookups, ["test-programme-a"]);
});

test("a deactivated rule's target is not required to be published", async () => {
  const report = await verifyPublishedMatching(
    setupOf([
      rule({ id: "parked", programmeKey: "retired-programme", active: false }),
      fallbackRule,
    ]),
    published(["test-programme-a"]),
  );

  assert.equal(report.ok, true);
  assert.deepEqual(report.checked, ["test-programme-a"]);
});

test("a missing or corrupt active setup is reported, not thrown", async () => {
  const report = await verifyPublishedMatching(
    {
      loadActiveSetup: async () => {
        throw new MatchingConfigurationError(
          "No matching setup is currently published.",
          "NO_ACTIVE_MATCHING_SETUP",
        );
      },
    },
    published([]),
  );

  assert.equal(report.ok, false);
  assert.equal(report.setupVersionId, null);
  assert.match(report.errors[0], /NO_ACTIVE_MATCHING_SETUP/);
});

test("verification performs no writes", async () => {
  const statements: string[] = [];

  await verifyPublishedMatching(setupOf([fallbackRule]), {
    findProgramme: async (key: string) => {
      statements.push(key);
      return { key };
    },
  });

  // The two collaborators are a snapshot load and a published-content lookup,
  // and both are SELECTs — there is no write path to take by accident.
  assert.deepEqual(statements, ["test-programme-a"]);
});
