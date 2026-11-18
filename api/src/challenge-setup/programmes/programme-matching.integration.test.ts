import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../../auth/guards/session.guard";
import databaseConfig from "../../config/database.config";
// Imported for its module side effect: it populates process.env from
// .env.local / .env, so databaseConfig() below reports the developer's real
// DATABASE_URL rather than the built-in fallback.
import appDataSource from "../../database/data-source";
import { assertDisposableTestDatabase } from "../../database/test-database-guard";
import { ChallengeSetupService } from "../challenge-setup.service";
import { noopProductAnalytics } from "../../observability/product-analytics.port";
import { MatchingRollout } from "./matching-rollout";
import { ProgrammeAssignmentRepository } from "./programme-assignment.repository";
import { ProgrammeContentRepository } from "./programme-content.repository";
import { ProgrammeMatcher } from "./programme-matcher";
import { ProgrammeMatchingRepository } from "./programme-matching.repository";

// What the unit suite structurally cannot prove: that the pessimistic row lock
// is real, that a failed content lookup rolls the whole completion back, that
// completion and the immutable assignment row genuinely commit or roll back
// together, and that matching reads the published setup from the database
// rather than from anything in the code tree.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
//
// See docs/database.md. Without the variable the whole file skips, so the
// default unit-test run stays green on a machine with no database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "programme-matching-user";
const SLUG = "first-take";
const MIRROR_DOCUMENT_ID = "programme-matching-first-take";
const SETUP_VERSION_PREFIX = "integration-setup-v";
const FALLBACK_RULE_ID = "integration-fallback";
const PROGRAMME_VERSION_PREFIX = "first-take-v";

let testSequence = 0;
let setupVersionId = "";
let programmeVersionId = "";

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Matching Creator",
  onboardingCompleted: true,
};

let dataSource: DataSource;

function buildService() {
  return new ChallengeSetupService(
    dataSource.getRepository("ChallengeSetupEntity") as never,
    dataSource.getRepository("UserProfileEntity") as never,
    new ProgrammeMatcher(new ProgrammeMatchingRepository(dataSource)),
    new ProgrammeAssignmentRepository(),
    dataSource,
    { emit: async () => ({ id: "unused" }) } as never,
    { dispatch: async () => ({ eventId: "unused", delivered: true }) } as never,
    new ProgrammeContentRepository(dataSource),
    {
      startInTransaction: async () => ({ id: "enrolment-1", created: true }),
      abandonActiveInTransaction: async () => undefined,
      completeActiveInTransaction: async () => undefined,
    } as never,
    { startRefusal: async () => null } as never,
    // This suite proves the published reader. The default rollout mode is
    // shadow, where the legacy matcher's answer is the one recorded.
    new MatchingRollout(noopProductAnalytics, undefined, "published"),
  );
}

async function setupRow(): Promise<Record<string, unknown> | undefined> {
  const [row] = (await dataSource.query(
    `SELECT "setupCompletedAt", "assignedProgrammeId", "programmeAssignedAt",
            "matchAlgorithmVersion", "matchLeafId", "weeklyCommitment"
     FROM "challenge_setup" WHERE "userId" = $1`,
    [USER_ID],
  )) as Record<string, unknown>[];

  return row;
}

// The first published setup, exactly as the seed writes it: one explicit
// fallback and no normal rules. Written through SQL rather than through the
// publisher so this suite tests the *reader*, not the CMS.
async function publishMatchingSetup(
  targetVersionId = programmeVersionId,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO "programme_matching_setup_versions"
       ("setupVersionId", "sourceDocumentId", "label", "publishedAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT ("setupVersionId") DO NOTHING`,
    [setupVersionId, "integration-doc", "Integration setup"],
  );
  await dataSource.query(
    `INSERT INTO "programme_matching_rules"
       ("setupVersionId", "ruleId", "name", "programmeKey", "programmeVersionId",
        "active", "priority", "fallback", "explanation", "conditions", "position")
     VALUES ($1, $2, $3, $4, $5, true, NULL, true, $6, '[]'::jsonb, 0)
     ON CONFLICT ("setupVersionId", "ruleId") DO NOTHING`,
    [
      setupVersionId,
      FALLBACK_RULE_ID,
      "Everyone else",
      SLUG,
      targetVersionId,
      "First Take is where every creator starts.",
    ],
  );
  await dataSource.query(
    `INSERT INTO "active_programme_matching_setup" ("id", "setupVersionId")
     VALUES (true, $1)
     ON CONFLICT ("id") DO UPDATE SET "setupVersionId" = EXCLUDED."setupVersionId"`,
    [setupVersionId],
  );
}

async function unpublishMatchingSetup(): Promise<void> {
  await dataSource.query(`DELETE FROM "active_programme_matching_setup"`);
}

async function assignmentRows(): Promise<Record<string, unknown>[]> {
  return (await dataSource.query(
    `SELECT "programmeKey", "programmeVersionId", "setupVersionId", "winningRuleId",
            "fallbackUsed", "multipleRulesQualified", "structuredAnswers", "trace",
            "active", "matchedAt"
     FROM "programme_assignment" WHERE "userId" = $1 ORDER BY "matchedAt"`,
    [USER_ID],
  )) as Record<string, unknown>[];
}

async function publishProgramme(): Promise<void> {
  await dataSource.query(
    `INSERT INTO "programme"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title")
     VALUES ($1, now(), now(), $2, $3)
     ON CONFLICT ("sourceDocumentId") DO NOTHING`,
    [MIRROR_DOCUMENT_ID, SLUG, "First Take"],
  );
  await dataSource.query(
    `INSERT INTO "programme_content_versions"
       ("programmeVersionId", "programmeKey", "sourceDocumentId",
        "sourceUpdatedAt", "contentHash", "snapshot")
     VALUES ($1, $2, $3, now(), $4, $5::jsonb)
     ON CONFLICT ("programmeVersionId") DO NOTHING`,
    [
      programmeVersionId,
      SLUG,
      MIRROR_DOCUMENT_ID,
      `hash-${programmeVersionId}`,
      JSON.stringify({
        programme: {
          id: MIRROR_DOCUMENT_ID,
          key: SLUG,
          title: "First Take",
          description: null,
          durationDays: 21,
          experienceLevel: "beginner",
          difficulty: "easy",
          track: "starter",
          founderVideoUrl: null,
          expectations: null,
          ctaText: null,
          milestones: [],
          insightMoments: [],
        },
        modules: [],
        lessons: [],
        tasks: [],
      }),
    ],
  );
  await dataSource.query(
    `INSERT INTO "programme_matching_target_eligibility"
       ("sourceDocumentId", "lifecycleStatus", "publicationStatus", "eligible")
     VALUES ($1, 'live', 'published', true)
     ON CONFLICT ("sourceDocumentId") DO UPDATE SET
       "lifecycleStatus" = EXCLUDED."lifecycleStatus",
       "publicationStatus" = EXCLUDED."publicationStatus",
       "eligible" = EXCLUDED."eligible"`,
    [MIRROR_DOCUMENT_ID],
  );
}

async function unpublishProgramme(): Promise<void> {
  await dataSource.query(`DELETE FROM "programme" WHERE "slug" = $1`, [SLUG]);
}

before(async () => {
  if (skip) {
    return;
  }

  // Refuses to touch anything that is not a separate, disposable database.
  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  testSequence += 1;
  setupVersionId = `${SETUP_VERSION_PREFIX}${testSequence}`;
  programmeVersionId = `${PROGRAMME_VERSION_PREFIX}${testSequence}`;

  await unpublishProgramme();
  await unpublishMatchingSetup();
  // The setup row references its assignment, so it goes first.
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(
    `DELETE FROM "programme_assignment" WHERE "userId" = $1`,
    [USER_ID],
  );
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "user_profile"
       ("userId", "userType", "region", "timezone", "platforms",
        "experienceLevel", "postingFrequency", "mainGoal", "biggestChallenge")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      USER_ID,
      "Independent Creator",
      "Nigeria",
      "Africa/Lagos",
      ["Instagram"],
      "Intermediate (6–18 months)",
      "A few times a week",
      "Grow my audience",
      "Staying consistent",
    ],
  );
  await dataSource.query(
    `INSERT INTO "challenge_setup"
       ("userId", "platforms", "postingGoal", "weeklyCommitment", "availableDays",
        "sawTestimonial", "nicheDefined", "contentType", "followerRange",
        "instagramConnected", "milestone")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      USER_ID,
      ["Instagram"],
      "Daily",
      5,
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      true,
      "Yes",
      "Educational",
      "1,001–5,000",
      false,
      "Publish consistently",
    ],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await unpublishProgramme();
  await unpublishMatchingSetup();
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test(
  "completion stores the matched programme and its audit trail",
  { skip },
  async () => {
    await publishProgramme();
    await publishMatchingSetup();

    const status = await buildService().completeStage2(user);

    const row = await setupRow();
    assert.equal(row?.assignedProgrammeId, SLUG);
    assert.equal(row?.matchAlgorithmVersion, setupVersionId);
    assert.equal(row?.matchLeafId, FALLBACK_RULE_ID);
    assert.ok(row?.setupCompletedAt);
    assert.ok(row?.programmeAssignedAt);
    assert.equal(status.setupCompleted, true);
  },
);

test(
  "the assignment records the exact versions, the winner and the evidence",
  { skip },
  async () => {
    await publishProgramme();
    await publishMatchingSetup();

    await buildService().completeStage2(user);

    const [assignment, ...rest] = await assignmentRows();
    assert.deepEqual(rest, [], "exactly one assignment is written");
    assert.equal(assignment.programmeKey, SLUG);
    assert.equal(assignment.programmeVersionId, programmeVersionId);
    assert.equal(assignment.setupVersionId, setupVersionId);
    assert.equal(assignment.winningRuleId, FALLBACK_RULE_ID);
    assert.equal(assignment.fallbackUsed, true);
    assert.equal(assignment.multipleRulesQualified, false);
    assert.equal(assignment.active, true);
    assert.ok(assignment.matchedAt);

    const answers = assignment.structuredAnswers as Record<string, unknown>;
    assert.equal(answers.userType, "Independent Creator");
    assert.equal(answers.weeklyCommitment, 5);
    assert.equal(
      answers.milestone,
      undefined,
      "free text never reaches the stored evidence",
    );
    assert.ok(
      !JSON.stringify(assignment).includes("Publish consistently"),
      "the written milestone is absent from the whole assignment record",
    );

    const trace = assignment.trace as { setupVersionId: string };
    assert.equal(trace.setupVersionId, setupVersionId);
  },
);

test(
  "no published matching setup fails closed and writes nothing",
  { skip },
  async () => {
    await publishProgramme();
    // Deliberately no setup published.

    await assert.rejects(
      () => buildService().completeStage2(user),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 500);
        assert.equal(error.response?.code, "MATCHING_UNAVAILABLE");
        return true;
      },
    );

    const row = await setupRow();
    assert.equal(row?.setupCompletedAt, null);
    assert.equal(row?.assignedProgrammeId, null);
    assert.deepEqual(await assignmentRows(), []);
  },
);

test(
  "an unmaterialized programme version rolls the whole completion back",
  { skip },
  async () => {
    // The setup publishes and matches; only the target's content is missing.
    await publishMatchingSetup("missing-programme-version");

    await assert.rejects(
      () => buildService().completeStage2(user),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 500);
        assert.equal(error.response?.code, "PROGRAMME_CONTENT_UNAVAILABLE");
        return true;
      },
    );

    const row = await setupRow();
    assert.equal(row?.setupCompletedAt, null);
    assert.equal(row?.assignedProgrammeId, null);
    assert.equal(row?.programmeAssignedAt, null);
    assert.equal(row?.matchAlgorithmVersion, null);
    assert.equal(row?.matchLeafId, null);
    assert.equal(row?.weeklyCommitment, 5, "the answers survive the rollback");
    assert.deepEqual(
      await assignmentRows(),
      [],
      "no assignment survives the rollback either",
    );
  },
);

test(
  "resubmitting leaves the original assignment and timestamps untouched",
  { skip },
  async () => {
    await publishProgramme();
    await publishMatchingSetup();
    const service = buildService();

    await service.completeStage2(user);
    const first = await setupRow();

    await service.completeStage2(user);
    const second = await setupRow();

    assert.deepEqual(second, first, "a repeat submission changes nothing");
    assert.equal(
      (await assignmentRows()).length,
      1,
      "and does not record a second assignment",
    );
  },
);

test(
  "concurrent completions on separate connections commit one assignment",
  { skip },
  async () => {
    await publishProgramme();
    await publishMatchingSetup();

    // Two services, so the two transactions genuinely contend for the row lock
    // on separate pooled connections rather than queueing in one client.
    const [first, second] = await Promise.all([
      buildService().completeStage2(user),
      buildService().completeStage2(user),
    ]);

    const [{ count }] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM "challenge_setup"
       WHERE "userId" = $1 AND "setupCompletedAt" IS NOT NULL`,
      [USER_ID],
    )) as { count: number }[];

    assert.equal(count, 1);
    assert.equal(
      first.programmeAssignedAt,
      second.programmeAssignedAt,
      "both callers observe the same committed assignment",
    );

    const row = await setupRow();
    assert.equal(row?.matchAlgorithmVersion, setupVersionId);
    assert.equal(row?.matchLeafId, FALLBACK_RULE_ID);
    assert.equal(
      (await assignmentRows()).length,
      1,
      "the partial unique index keeps the loser from inserting a second row",
    );
  },
);

test(
  "a partial save racing completion cannot rewrite the matched answers",
  { skip },
  async () => {
    await publishProgramme();
    await publishMatchingSetup();

    const [completion, save] = await Promise.allSettled([
      buildService().completeStage2(user),
      buildService().saveStage2Answers(user, { weeklyCommitment: 1 }),
    ]);

    assert.equal(completion.status, "fulfilled");

    const row = await setupRow();
    assert.equal(row?.assignedProgrammeId, SLUG);

    if (save.status === "rejected") {
      assert.equal(save.reason.response?.code, "SETUP_ALREADY_COMPLETED");
      assert.equal(row?.weeklyCommitment, 5);
    } else {
      // The save committed first, so the assignment was matched from the value
      // that is stored — the two never disagree.
      assert.equal(row?.weeklyCommitment, 1);
    }
  },
);

test(
  "the published mirror lookup finds the real seeded row",
  { skip },
  async () => {
    await publishProgramme();
    const content = new ProgrammeContentRepository(dataSource);

    const programme = await content.findProgramme(SLUG);
    assert.equal(programme?.id, SLUG);
    assert.equal(programme?.title, "First Take");
    assert.equal(await content.findProgramme("not-a-programme"), undefined);
  },
);

test("beginProgramme still starts the assigned programme", { skip }, async () => {
  await publishProgramme();
  await publishMatchingSetup();
  const service = buildService();
  await service.completeStage2(user);

  const status = await service.beginProgramme(user);

  const [row] = (await dataSource.query(
    `SELECT "programmeStartedAt", "day1ScheduledFor" FROM "challenge_setup"
     WHERE "userId" = $1`,
    [USER_ID],
  )) as { programmeStartedAt: Date | null; day1ScheduledFor: Date | null }[];

  // Matching assigns; starting stays a separate, later decision.
  assert.ok(row.programmeStartedAt, "the start is recorded");
  assert.ok(row.day1ScheduledFor, "Day 1 is scheduled");
  assert.equal(status.programmeStarted, true);
});
