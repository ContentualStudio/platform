import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { Pool } from "pg";
import {
  matchingOperatorTokens,
  type PublishedMatchingRule,
} from "@contentual/programme-matching-vocabulary";
import type {
  ProgrammeTarget,
  ProgrammeTargetLookup,
} from "./matching-authoring";
import {
  listPublishedVersions,
  publishMatchingSetup,
  readPublishedRules,
  recordRejectedAttempt,
  restoreMatchingSetup,
  UnknownMatchingVersionError,
} from "./matching-publish";

// These cover the publication transaction itself, which unit tests cannot
// reach: that the whole snapshot lands or none of it does, that a rejected or
// failed attempt leaves the previous setup active and serving, and that restore
// appends a new version rather than reviving an old row.
//
//   APP_MIRROR_DATABASE_URL=postgresql://... yarn workspace @contentual/cms test
const connectionString = process.env.APP_MIRROR_DATABASE_URL;
const options = {
  skip: connectionString
    ? false
    : "APP_MIRROR_DATABASE_URL is not set; skipping matching publication tests",
};

const pool = connectionString ? new Pool({ connectionString }) : undefined;
const DOCUMENT_ID = "matching-setup-doc";

after(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await pool?.query(
    `TRUNCATE active_programme_matching_setup, programme_matching_rules,
              programme_matching_setup_versions, matching_publication_attempts,
              programme_matching_target_eligibility
     RESTART IDENTITY CASCADE`,
  );
  await pool?.query(`
    INSERT INTO programme_matching_target_eligibility
      ("sourceDocumentId", "lifecycleStatus", "publicationStatus", "eligible")
    VALUES
      ('document-first-take', 'live', 'published', true),
      ('document-momentum', 'live', 'published', true)
  `);
});

function fallback(
  overrides: Partial<PublishedMatchingRule> = {},
): PublishedMatchingRule {
  return {
    id: "rule-fallback",
    name: "Everyone else",
    programmeKey: "first-take",
    programmeVersionId: "first-take@v1",
    active: true,
    priority: null,
    fallback: true,
    explanation: "First Take is where every creator starts.",
    conditions: [],
    ...overrides,
  };
}

function normal(
  overrides: Partial<PublishedMatchingRule> = {},
): PublishedMatchingRule {
  return {
    id: "rule-daily",
    name: "Daily posters",
    programmeKey: "momentum",
    programmeVersionId: "momentum@v1",
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

async function activeVersionId(): Promise<string | null> {
  const { rows } = await pool!.query(
    `SELECT "setupVersionId" FROM active_programme_matching_setup`,
  );

  return rows[0]?.setupVersionId ?? null;
}

async function attempts(): Promise<Record<string, unknown>[]> {
  const { rows } = await pool!.query(
    `SELECT "outcome", "reasonCode", "errors", "actor", "setupVersionId"
     FROM matching_publication_attempts ORDER BY "id"`,
  );

  return rows;
}

// Stands in for Payload. `live` is the set of programme keys that still have
// published content — restore has to ask again, because a programme that was
// live when a version was published may since have been retired.
function programmesWhere(live: string[]): ProgrammeTargetLookup {
  const available = new Set(live);

  return {
    resolve: async () => null,
    resolveKey: async (programmeKey) =>
      available.has(programmeKey)
        ? targetFor(programmeKey, `${programmeKey}@current`)
        : null,
  };
}

function targetFor(
  programmeKey: string,
  programmeVersionId: string,
): ProgrammeTarget {
  return {
    programmeKey,
    programmeVersionId,
    sourceDocumentId: `document-${programmeKey}`,
    sourceUpdatedAt: "2026-08-27T10:00:00.000Z",
    snapshot: {
      programme: {
        id: `document-${programmeKey}`,
        key: programmeKey,
        title: programmeKey,
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
}

const allProgrammesLive = programmesWhere(["first-take", "momentum"]);

async function restore(setupVersionId: string, programmes = allProgrammesLive) {
  return restoreMatchingSetup({
    sourceDocumentId: DOCUMENT_ID,
    setupVersionId,
    label: "Restored: Original",
    programmes,
  });
}

async function publish(rules: PublishedMatchingRule[], label = "Launch setup") {
  return publishMatchingSetup({
    sourceDocumentId: DOCUMENT_ID,
    label,
    rules,
    actor: "operator@contentual.test",
    programmeTargets: rules.map((rule) =>
      targetFor(rule.programmeKey, rule.programmeVersionId),
    ),
  });
}

test("publishing writes the whole snapshot and activates it", options, async () => {
  const version = await publish([normal(), fallback()]);

  assert.equal(version.ruleCount, 2);
  assert.equal(version.activeNormalRuleCount, 1);
  assert.equal(version.fallbackProgrammeKey, "first-take");
  assert.equal(await activeVersionId(), version.setupVersionId);

  const rules = await readPublishedRules(version.setupVersionId);
  assert.deepEqual(
    rules.map((rule) => rule.id),
    ["rule-daily", "rule-fallback"],
    "authoring order survives the round trip",
  );
  assert.deepEqual(rules[0].conditions, normal().conditions);
});

test("the publication is recorded with its actor", options, async () => {
  const version = await publish([fallback()]);
  const [attempt, ...rest] = await attempts();

  assert.deepEqual(rest, []);
  assert.equal(attempt.outcome, "published");
  assert.equal(attempt.setupVersionId, version.setupVersionId);
  assert.equal(attempt.actor, "operator@contentual.test");
});

test(
  "a constraint violation rolls the whole snapshot back",
  options,
  async () => {
    const first = await publish([fallback()]);

    // Two active rules sharing a priority. Validation would normally catch it;
    // the partial unique index is what guarantees a validator bug cannot
    // produce an unorderable live setup.
    await assert.rejects(() =>
      publish([
        normal(),
        normal({ id: "rule-other", name: "Other route" }),
        fallback(),
      ]),
    );

    assert.equal(
      await activeVersionId(),
      first.setupVersionId,
      "the previous setup is still the live one",
    );

    const { rows } = await pool!.query(
      `SELECT count(*)::int AS count FROM programme_matching_setup_versions`,
    );
    assert.equal(rows[0].count, 1, "the half-written version is gone");
  },
);

test(
  "a failed publication is still recorded, outside the rollback",
  options,
  async () => {
    await publish([fallback()]);
    await assert.rejects(() =>
      publish([normal(), normal({ id: "rule-other" }), fallback()]),
    );

    const outcomes = (await attempts()).map((attempt) => attempt.outcome);
    assert.deepEqual(outcomes, ["published", "failed"]);
  },
);

test(
  "a rejected publication records the operator-facing reasons and changes nothing",
  options,
  async () => {
    const first = await publish([fallback()]);

    await recordRejectedAttempt({
      sourceDocumentId: DOCUMENT_ID,
      errors: [
        {
          field: "rules",
          ruleLabel: "Daily posters",
          message: 'Rule "Daily posters", condition 1: "Astronaut" is not an answer users can select',
        },
      ],
      actor: "operator@contentual.test",
    });

    assert.equal(await activeVersionId(), first.setupVersionId);

    const rejected = (await attempts()).at(-1)!;
    assert.equal(rejected.outcome, "rejected");
    assert.equal(rejected.reasonCode, "VALIDATION_FAILED");
    assert.match(
      JSON.stringify(rejected.errors),
      /is not an answer users can select/,
    );
  },
);

test("publishing again swaps the pointer and keeps both versions", options, async () => {
  const first = await publish([fallback()], "First setup");
  const second = await publish([normal(), fallback()], "Second setup");

  assert.notEqual(first.setupVersionId, second.setupVersionId);
  assert.equal(await activeVersionId(), second.setupVersionId);

  const versions = await listPublishedVersions();
  assert.deepEqual(
    versions.map((version) => version.label),
    ["Second setup", "First setup"],
    "newest first",
  );
  assert.deepEqual(
    versions.map((version) => version.active),
    [true, false],
  );
});

test("a published version can never be edited", options, async () => {
  const version = await publish([fallback()]);

  await assert.rejects(
    () =>
      pool!.query(
        `UPDATE programme_matching_rules SET "explanation" = 'rewritten'
         WHERE "setupVersionId" = $1`,
        [version.setupVersionId],
      ),
    /immutable/,
  );
});

test(
  "restoring publishes a new version rather than reviving the old row",
  options,
  async () => {
    const original = await publish([fallback()], "Original");
    await publish([normal(), fallback()], "Replacement");

    const result = await restore(original.setupVersionId);
    assert.ok(result.published);
    const restored = result.version;

    assert.notEqual(restored.setupVersionId, original.setupVersionId);
    assert.equal(restored.restoredFromVersionId, original.setupVersionId);
    assert.equal(await activeVersionId(), restored.setupVersionId);

    assert.deepEqual(
      (await readPublishedRules(restored.setupVersionId)).map((rule) => rule.id),
      (await readPublishedRules(original.setupVersionId)).map((rule) => rule.id),
      "the restored version has the rules it was copied from",
    );
    assert.equal(
      (await listPublishedVersions()).length,
      3,
      "history is append-only",
    );
  },
);

test("restoring an unknown version is refused", options, async () => {
  await assert.rejects(
    () => restore("does-not-exist"),
    UnknownMatchingVersionError,
  );
});

test(
  "restoring a version published from another setup is refused",
  options,
  async () => {
    const other = await publishMatchingSetup({
      sourceDocumentId: "a-different-setup-document",
      label: "Someone else's setup",
      rules: [fallback()],
      programmeTargets: [targetFor("first-take", "first-take@v1")],
    });

    await assert.rejects(
      () => restore(other.setupVersionId),
      UnknownMatchingVersionError,
      "a version id alone must not be enough to activate a setup",
    );
  },
);

test(
  "restoring re-pins each rule to the programme's current published content",
  options,
  async () => {
    const original = await publish([normal(), fallback()], "Original");

    const result = await restore(original.setupVersionId);
    assert.ok(result.published);

    const rules = await readPublishedRules(result.version.setupVersionId);
    assert.deepEqual(
      rules.map((rule) => rule.programmeVersionId).sort(),
      ["first-take@current", "momentum@current"],
      "a restore decides what new users get, so it targets content that exists today",
    );
  },
);

test(
  "restoring is refused when a target programme is no longer live",
  options,
  async () => {
    const original = await publish([normal(), fallback()], "Original");
    const replacement = await publish([fallback()], "Replacement");

    // "momentum" has since been retired.
    const result = await restore(
      original.setupVersionId,
      programmesWhere(["first-take"]),
    );

    assert.equal(result.published, false);
    assert.ok(!result.published);
    assert.match(
      result.errors[0].message,
      /"momentum" is no longer a live programme with published content/,
    );
    assert.equal(
      await activeVersionId(),
      replacement.setupVersionId,
      "the setup already running keeps running",
    );
    assert.equal((await attempts()).at(-1)!.outcome, "rejected");
  },
);
