import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  createTransactionHarness,
  fakeDispatcher,
  fakeEmitter,
  unreachable,
} from "../content-engine/testing/content-event-fakes";
import { ChallengeSetupService } from "./challenge-setup.service";
import type { ChallengeSetupEntity } from "./entities/challenge-setup.entity";
import { RecordingProgrammeContentReader } from "./programmes/programme-content.testing";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

// The shape the CMS-authored matcher returns for the initial setup: the
// explicit fallback, pinned to a published First Take version.
const SETUP_VERSION_ID = "setup-first-take-v1";
const FALLBACK_RULE_ID = "rule-fallback";

const firstTakeMatch = {
  profile: {},
  trace: {
    setupVersionId: SETUP_VERSION_ID,
    selectedRuleId: FALLBACK_RULE_ID,
    selectedRuleName: "Everyone else",
    selectedProgrammeKey: "first-take",
    selectedProgrammeVersionId: "first-take-v1",
    explanation: "First Take is where every creator starts.",
    fallbackUsed: true,
    multipleRulesQualified: false,
    qualifyingRuleIds: [],
    considered: [],
  },
};

// A schema-valid Stage 1 profile row. `name` lives on the account rather than
// the profile, so it is supplied from the authenticated user.
function completeProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: user.id,
    userType: "Independent Creator",
    region: "Nigeria",
    timezone: "Africa/Lagos",
    platforms: ["Instagram"],
    experienceLevel: "Intermediate (6–18 months)",
    postingFrequency: "A few times a week",
    mainGoal: "Grow my audience",
    biggestChallenge: "Staying consistent",
    ...overrides,
  };
}

function completeAnswers(
  overrides: Partial<ChallengeSetupEntity> = {},
): ChallengeSetupEntity {
  return {
    userId: user.id,
    platforms: ["Instagram"],
    postingGoal: "Daily",
    weeklyCommitment: 5,
    availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    sawTestimonial: true,
    nicheDefined: "Yes",
    contentType: "Educational",
    followerRange: "1,001–5,000",
    instagramConnected: false,
    milestone: "Publish consistently",
    setupCompletedAt: null,
    assignedProgrammeId: null,
    programmeAssignedAt: null,
    matchAlgorithmVersion: null,
    matchLeafId: null,
    programmeStartedAt: null,
    day1ScheduledFor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChallengeSetupEntity;
}

function assignedSetup(overrides: Partial<ChallengeSetupEntity> = {}) {
  return completeAnswers({
    setupCompletedAt: new Date("2026-07-01T00:00:00.000Z"),
    assignedProgrammeId: "first-take",
    assignedProgrammeVersionId: "first-take-v1",
    programmeAssignedAt: new Date("2026-07-01T00:00:00.000Z"),
    matchAlgorithmVersion: SETUP_VERSION_ID,
    matchLeafId: FALLBACK_RULE_ID,
    ...overrides,
  });
}

interface ServiceParts {
  setupRepository?: unknown;
  profileRepository?: unknown;
  matcher?: unknown;
  assignments?: unknown;
  dataSource?: unknown;
  emitter?: unknown;
  dispatcher?: unknown;
  contentReader?: unknown;
  enrolments?: unknown;
  eligibility?: unknown;
}

// Single construction site so the constructor's shape is stated once. Anything
// a given test has no business reaching gets a dependency that throws.
function buildService(parts: ServiceParts) {
  return new ChallengeSetupService(
    (parts.setupRepository ?? {}) as never,
    (parts.profileRepository ?? {}) as never,
    (parts.matcher ?? { match: unreachable("matcher.match") }) as never,
    (parts.assignments ?? {
      record: async () => ({ id: "assignment-1" }),
      supersedeActiveIfPresent: async () => undefined,
      resolveInitialAttemptId: async (_manager: unknown, userId: string) =>
        `initial:${userId}`,
    }) as never,
    (parts.dataSource ?? {
      transaction: unreachable("dataSource.transaction"),
    }) as never,
    (parts.emitter ?? { emit: unreachable("eventEmitter.emit") }) as never,
    (parts.dispatcher ?? {
      dispatch: unreachable("eventDispatcher.dispatch"),
    }) as never,
    (parts.contentReader ??
      new RecordingProgrammeContentReader(["first-take"])) as never,
    (parts.enrolments ?? {
      startInTransaction: async () => ({ id: "enrolment-1", created: true }),
      abandonActiveInTransaction: async () => undefined,
      completeActiveInTransaction: async () => undefined,
    }) as never,
    (parts.eligibility ?? { startRefusal: async () => null }) as never,
  );
}

// ── Completion harness ──
//
// Completion is one transaction that locks the user's setup row, validates
// both stages, matches, resolves the slug against published content, and
// writes. The fake models the parts a unit test can honestly model: a single
// stored row, a row lock that serializes overlapping transactions, and reads
// that see whatever the previous transaction committed.
//
// It cannot model a rollback — the service throws before it ever calls save(),
// which is the property these tests actually assert. Real rollback, real row
// locking and the real mirror lookup are proved against Postgres in
// programme-matching.integration.test.ts.
interface CompletionHarnessOptions {
  stored?: ChallengeSetupEntity | null;
  profile?: Record<string, unknown> | null;
  published?: string[];
  eligible?: boolean;
  match?: () => unknown;
}

function completionHarness(options: CompletionHarnessOptions = {}) {
  let stored =
    options.stored === undefined ? completeAnswers() : options.stored;
  const contentReader = new RecordingProgrammeContentReader(
    options.published ?? ["first-take"],
  );
  const lockModes: string[] = [];
  const saves: ChallengeSetupEntity[] = [];
  const upserts: Partial<ChallengeSetupEntity>[] = [];
  const queries: string[] = [];
  let matcherCalls = 0;
  // Models the pessimistic row lock: one completion transaction at a time,
  // and the next one reads what the previous one committed.
  let queue: Promise<unknown> = Promise.resolve();

  const isProfile = (entity: { name?: string }) =>
    (entity?.name ?? "").includes("Profile");

  const manager = {
    findOne: async (
      entity: { name?: string },
      criteria: { lock?: { mode?: string } },
    ) => {
      if (isProfile(entity)) {
        return options.profile === undefined
          ? completeProfile()
          : options.profile;
      }

      lockModes.push(criteria?.lock?.mode ?? "none");
      return stored ? ({ ...stored } as ChallengeSetupEntity) : null;
    },
    findOneBy: async (entity: { name?: string }) => {
      if (isProfile(entity)) {
        return options.profile === undefined
          ? completeProfile()
          : options.profile;
      }

      return stored ? ({ ...stored } as ChallengeSetupEntity) : null;
    },
    save: async (entity: ChallengeSetupEntity) => {
      saves.push({ ...entity });
      stored = { ...entity };
      return stored;
    },
    upsert: async (
      _entity: unknown,
      values: Partial<ChallengeSetupEntity>,
    ) => {
      upserts.push({ ...values });
      stored = { ...(stored ?? completeAnswers()), ...values };
      return { identifiers: [] };
    },
    query: async (sql: string) => {
      queries.push(sql);
      return sql.includes("programme_matching_target_eligibility") &&
        options.eligible !== false
        ? [{}]
        : [];
    },
  };

  const dataSource = {
    transaction: async (work: (manager: unknown) => Promise<unknown>) => {
      const previous = queue.catch(() => undefined);
      let release!: () => void;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      try {
        return await work(manager);
      } finally {
        release();
      }
    },
  };

  const service = buildService({
    dataSource,
    contentReader,
    matcher: {
      match: () => {
        matcherCalls += 1;
        return options.match ? options.match() : firstTakeMatch;
      },
    },
    setupRepository: {
      findOneBy: async () => (stored ? { ...stored } : null),
    },
  });

  return {
    service,
    contentReader,
    lockModes,
    queries,
    saves,
    upserts,
    get matcherCalls() {
      return matcherCalls;
    },
    get stored() {
      return stored;
    },
  };
}

// ── Stage 2 partial saves ──

test("saving an individual Stage 2 answer never completes or assigns", async () => {
  const harness = completionHarness();

  const status = await harness.service.saveStage2Answers(user, {
    followerRange: "1,001–5,000",
  });

  assert.deepEqual(harness.saves, [], "a partial save never writes assignment");
  assert.equal(harness.matcherCalls, 0);
  assert.equal(status.setupCompleted, false);
  assert.equal(status.assignedProgramme, null);
});

test("a partial Stage 2 save is never completeness-checked", async () => {
  const harness = completionHarness({
    stored: completeAnswers({ followerRange: null }),
  });

  // Half-answered data is a legitimate saved state; only completeStage2
  // decides whether the questionnaire is finished.
  const status = await harness.service.saveStage2Answers(user, {
    weeklyCommitment: 4,
  });

  assert.equal(status.setupCompleted, false);
  assert.equal(status.answers.followerRange, null);
});

test("a partial save takes the same row lock completion takes", async () => {
  const harness = completionHarness();

  await harness.service.saveStage2Answers(user, { weeklyCommitment: 4 });

  // Without the lock, the completion check below and the write that follows it
  // could straddle a concurrent completion.
  assert.deepEqual(harness.lockModes, ["pessimistic_write"]);
});

test("editing answers after completion is rejected as a conflict", async () => {
  const harness = completionHarness({ stored: assignedSetup() });

  // The assignment is immutable, so the answers it was derived from cannot be
  // allowed to drift away from it after the fact.
  await assert.rejects(
    () => harness.service.saveStage2Answers(user, { weeklyCommitment: 2 }),
    (error: { status?: number; response?: { code?: string } }) => {
      assert.equal(error.status, 409);
      assert.equal(error.response?.code, "SETUP_ALREADY_COMPLETED");
      return true;
    },
  );
  assert.deepEqual(harness.upserts, []);
  assert.equal(harness.stored?.weeklyCommitment, 5, "answers are untouched");
});

test("a save racing a completion cannot overwrite the matched answers", async () => {
  const harness = completionHarness();

  // Both run against one serialized row lock. Whichever order they land in,
  // the invariant is the same: answers behind a stored assignment never change.
  const [completion, save] = await Promise.allSettled([
    harness.service.completeStage2(user),
    harness.service.saveStage2Answers(user, { weeklyCommitment: 1 }),
  ]);

  assert.equal(completion.status, "fulfilled");
  assert.equal(harness.stored?.assignedProgrammeId, "first-take");

  if (save.status === "rejected") {
    // Completion won the lock; the late save was refused outright.
    assert.equal(save.reason.response?.code, "SETUP_ALREADY_COMPLETED");
    assert.equal(harness.stored?.weeklyCommitment, 5);
  } else {
    // The save won the lock and committed before matching even read the row,
    // so the assignment was derived from the value that is stored.
    assert.equal(harness.stored?.weeklyCommitment, 1);
  }
});

test("an empty save after completion stays a harmless status read", async () => {
  const harness = completionHarness({ stored: assignedSetup() });

  const status = await harness.service.saveStage2Answers(user, {});

  assert.deepEqual(harness.upserts, []);
  assert.deepEqual(harness.lockModes, [], "a read takes no write lock");
  assert.equal(status.setupCompleted, true);
  assert.equal(status.programmeAssignedAt, "2026-07-01T00:00:00.000Z");
});

// ── Completion: validation ──
//
// Every column feeding the matcher is nullable, and Stage 1 lives on a
// different table than Stage 2, so a profile that was complete when Stage 2
// was answered can be emptied afterwards. The guarantee under test is the
// ordering one: nothing downstream of validation — not the matcher, not the
// content reader, not the write — is reached with data that does not parse.

interface ValidationCase {
  name: string;
  stored: ChallengeSetupEntity | null;
  profile: Record<string, unknown> | null;
  user?: AuthenticatedUser;
  code: "INCOMPLETE_STAGE1" | "INCOMPLETE_STAGE2";
}

const validationCases: ValidationCase[] = [
  {
    name: "a user with no profile row at all",
    stored: completeAnswers(),
    profile: null,
    code: "INCOMPLETE_STAGE1",
  },
  {
    name: "a profile whose platforms were emptied after Stage 2",
    stored: completeAnswers(),
    profile: completeProfile({ platforms: null }),
    code: "INCOMPLETE_STAGE1",
  },
  {
    name: "a profile carrying a value the Stage 1 schema rejects",
    stored: completeAnswers(),
    profile: completeProfile({ userType: "Hobbyist" }),
    code: "INCOMPLETE_STAGE1",
  },
  {
    name: "an account with no name",
    stored: completeAnswers(),
    profile: completeProfile(),
    user: { ...user, name: "" },
    code: "INCOMPLETE_STAGE1",
  },
  {
    name: "a user with no challenge setup row at all",
    stored: null,
    profile: completeProfile(),
    code: "INCOMPLETE_STAGE2",
  },
  {
    name: "a setup whose follower range is still unanswered",
    stored: completeAnswers({ followerRange: null }),
    profile: completeProfile(),
    code: "INCOMPLETE_STAGE2",
  },
  {
    name: "a setup carrying a weekly commitment outside the allowed range",
    stored: completeAnswers({ weeklyCommitment: 9 }),
    profile: completeProfile(),
    code: "INCOMPLETE_STAGE2",
  },
];

for (const validationCase of validationCases) {
  test(`completion rejects ${validationCase.name} with ${validationCase.code}`, async () => {
    const harness = completionHarness({
      stored: validationCase.stored,
      profile: validationCase.profile,
    });

    await assert.rejects(
      () => harness.service.completeStage2(validationCase.user ?? user),
      (error: { status?: number; response?: { code?: string } }) => {
        assert.equal(error.status, 400);
        assert.equal(error.response?.code, validationCase.code);
        return true;
      },
    );

    assert.equal(
      harness.matcherCalls,
      0,
      "the matcher must not see unparsed answers",
    );
    assert.deepEqual(
      harness.contentReader.transactionalLookups,
      [],
      "the publication gate must not be consulted after a validation failure",
    );
    assert.deepEqual(harness.saves, []);
  });
}

// ── Completion: assignment ──

test("completion commits the slug, both timestamps and the audit trail together", async () => {
  const harness = completionHarness();

  const status = await harness.service.completeStage2(user);

  const [saved] = harness.saves;
  assert.equal(harness.saves.length, 1, "one write, not a partial sequence");
  assert.equal(saved.assignedProgrammeId, "first-take");
  assert.equal(saved.matchAlgorithmVersion, SETUP_VERSION_ID);
  assert.equal(saved.matchLeafId, FALLBACK_RULE_ID);
  assert.ok(saved.setupCompletedAt instanceof Date);
  assert.ok(saved.programmeAssignedAt instanceof Date);
  assert.equal(
    saved.setupCompletedAt?.toISOString(),
    saved.programmeAssignedAt?.toISOString(),
    "completion and assignment are the same moment",
  );
  assert.equal(status.setupCompleted, true);
  assert.deepEqual(harness.contentReader.transactionalLookups, ["first-take"]);
});

test("the setup row is locked for update before completion is decided", async () => {
  const harness = completionHarness();

  await harness.service.completeStage2(user);

  assert.deepEqual(harness.lockModes, ["pessimistic_write"]);
});

test("completion serializes matching and assignment with CMS publication", async () => {
  const harness = completionHarness();

  await harness.service.completeStage2(user);

  assert.ok(
    harness.queries.some((sql) => sql.includes("pg_advisory_xact_lock")),
  );
  assert.ok(
    harness.queries.some((sql) =>
      sql.includes("programme_matching_target_eligibility"),
    ),
  );
});

test("matching receives the canonical structured profile and nothing else", async () => {
  let matcherInput: unknown;
  const service = buildService({
    dataSource: {
      transaction: async (work: (manager: unknown) => Promise<unknown>) =>
        work({
          findOne: async (entity: { name?: string }) =>
            (entity?.name ?? "").includes("Profile")
              ? completeProfile()
              : completeAnswers(),
          findOneBy: async (entity: { name?: string }) =>
            (entity?.name ?? "").includes("Profile")
              ? completeProfile()
              : completeAnswers(),
          save: async (entity: unknown) => entity,
          query: async (sql: string) =>
            sql.includes("programme_matching_target_eligibility") ? [{}] : [],
        }),
    },
    matcher: {
      match: (input: unknown) => {
        matcherInput = input;
        return firstTakeMatch;
      },
    },
  });

  await service.completeStage2(user);

  // Exactly the catalogue's fields. The Stage 1 name, region and timezone, the
  // Stage 2 available days and testimonial flag, and the written milestone are
  // all absent — not filtered out downstream, but structurally unable to
  // arrive, because the matching profile has no key for them.
  assert.deepEqual(matcherInput, {
    userType: "Independent Creator",
    selectedPlatforms: ["Instagram"],
    primaryPlatform: "Instagram",
    experienceLevel: "Intermediate (6–18 months)",
    currentPostingFrequency: "A few times a week",
    desiredPostingFrequency: "Daily",
    mainGoal: "Grow my audience",
    biggestChallenge: "Staying consistent",
    weeklyCommitment: 5,
    nicheDefined: "Yes",
    preferredContentType: "Educational",
    followerRange: "1,001–5,000",
    platformConnectionStatus: "not_connected",
  });
});

test("an unpublished match fails closed and writes nothing", async () => {
  const harness = completionHarness({ published: [] });

  await assert.rejects(
    () => harness.service.completeStage2(user),
    (error: { status?: number; response?: { code?: string } }) => {
      assert.equal(error.status, 500);
      assert.equal(error.response?.code, "PROGRAMME_CONTENT_UNAVAILABLE");
      return true;
    },
  );

  assert.deepEqual(harness.saves, [], "completion must not be written");
  assert.equal(harness.stored?.setupCompletedAt, null);
  assert.equal(harness.stored?.assignedProgrammeId, null);
  assert.equal(harness.stored?.matchAlgorithmVersion, null);
  assert.equal(harness.stored?.matchLeafId, null);
});

test("an ineligible programme fails closed even when its snapshot exists", async () => {
  const harness = completionHarness({ eligible: false });

  await assert.rejects(
    () => harness.service.completeStage2(user),
    (error: { status?: number; response?: { code?: string } }) => {
      assert.equal(error.status, 500);
      assert.equal(error.response?.code, "PROGRAMME_CONTENT_UNAVAILABLE");
      return true;
    },
  );

  assert.deepEqual(harness.saves, []);
});

test("a failing matcher preserves the answers without recording completion", async () => {
  const harness = completionHarness({
    match: () => {
      throw new Error("matcher unavailable");
    },
  });

  await assert.rejects(
    () => harness.service.completeStage2(user),
    /matcher unavailable/,
  );

  assert.deepEqual(harness.saves, []);
  assert.deepEqual(harness.contentReader.transactionalLookups, []);
  assert.equal(harness.stored?.setupCompletedAt, null);
  assert.equal(harness.stored?.assignedProgrammeId, null);
});

test("a repeat completion returns the stored assignment without rematching", async () => {
  const harness = completionHarness({ stored: assignedSetup() });

  const status = await harness.service.completeStage2(user);

  assert.equal(harness.matcherCalls, 0, "an assignment is never re-derived");
  assert.deepEqual(harness.contentReader.transactionalLookups, []);
  assert.deepEqual(harness.saves, []);
  assert.equal(status.setupCompleted, true);
  assert.equal(status.programmeAssignedAt, "2026-07-01T00:00:00.000Z");
});

test("concurrent completions leave exactly one durable assignment", async () => {
  const harness = completionHarness();

  const [first, second] = await Promise.all([
    harness.service.completeStage2(user),
    harness.service.completeStage2(user),
  ]);

  // The loser of the race finds setupCompletedAt already set behind the row
  // lock and returns the winner's row untouched.
  assert.equal(harness.matcherCalls, 1);
  assert.equal(harness.saves.length, 1);
  assert.deepEqual(harness.contentReader.transactionalLookups, ["first-take"]);
  assert.equal(first.programmeAssignedAt, second.programmeAssignedAt);
  assert.equal(harness.stored?.matchAlgorithmVersion, SETUP_VERSION_ID);
  assert.equal(harness.stored?.matchLeafId, FALLBACK_RULE_ID);
});

// ── Begin Programme ──
//
// beginProgramme() owns its own transaction, so its fakes model one. The
// shared harness records when the callback starts and when the transaction
// resolves, which is what lets the tests assert the ordering guarantee that
// matters: the evaluator is never reached while the programme-start
// transaction is open.
interface HarnessOptions {
  setup: ChallengeSetupEntity | null;
  profile?: Record<string, unknown> | null;
  // 0 models losing the idempotency race: another request already started.
  affected?: number;
  winner?: ChallengeSetupEntity | null;
  emitFails?: string;
  dispatchFails?: string;
}

function transactionHarness(options: HarnessOptions) {
  let updateExecuted = false;
  const lockModes: string[] = [];

  const manager = {
    findOne: async (
      entity: { name?: string },
      findOptions?: { lock?: { mode?: string } },
    ) => {
      if (findOptions?.lock?.mode) {
        lockModes.push(findOptions.lock.mode);
      }
      return (entity?.name ?? "").includes("Profile")
        ? (options.profile ?? null)
        : options.setup;
    },
    findOneBy: async (entity: { name?: string }) => {
      // The service reads the setup, then the profile, then — only after a lost
      // race — reloads the winner. They are told apart by the entity asked for
      // and by whether the conditional update has already run.
      if ((entity?.name ?? "").includes("Profile")) {
        return options.profile ?? null;
      }
      return updateExecuted ? (options.winner ?? null) : options.setup;
    },
    update: async () => ({ affected: 1 }),
    createQueryBuilder: () => {
      const builder = {
        update: () => builder,
        set: () => builder,
        where: () => builder,
        andWhere: () => builder,
        execute: async () => {
          updateExecuted = true;
          return { affected: options.affected ?? 1 };
        },
      };
      return builder;
    },
  };

  const harness = createTransactionHarness(manager);
  const emitter = fakeEmitter({ failWith: options.emitFails });
  const dispatcher = fakeDispatcher({
    isTransactionOpen: harness.isTransactionOpen,
    failFor: options.dispatchFails ? () => true : undefined,
  });

  return {
    dataSource: harness.dataSource,
    emitter,
    dispatcher,
    get emitted() {
      return emitter.emitted.map(({ eventId, eventName, payload }) => ({
        eventId,
        eventName,
        payload,
      }));
    },
    get dispatched() {
      return dispatcher.dispatched;
    },
    get dispatchSawOpenTransaction() {
      return dispatcher.sawOpenTransaction;
    },
    lockModes,
  };
}

function beginProgrammeService(harness: ReturnType<typeof transactionHarness>) {
  return buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
  });
}

test("the first begin emits programme.started once and dispatches after commit", async () => {
  const harness = transactionHarness({
    setup: assignedSetup(),
    profile: { timezone: "Africa/Lagos" },
  });

  const status = await beginProgrammeService(harness).beginProgramme(user);

  assert.deepEqual(harness.emitted, [
    {
      eventId: "programme.started:user-1:first-take",
      eventName: eventNameTokens.programmeStarted,
      payload: {
        userId: "user-1",
        programmeId: "first-take",
      },
    },
  ]);
  assert.deepEqual(harness.dispatched, ["programme.started:user-1:first-take"]);
  assert.equal(
    harness.dispatchSawOpenTransaction,
    false,
    "the evaluator must never be reached inside the fact transaction",
  );

  // The HTTP contract is unchanged by the matching work.
  assert.equal(status.programmeStarted, true);
  assert.equal(status.setupCompleted, true);
  assert.ok(status.day1ScheduledFor);
  assert.equal(status.answers.instagramConnected, false);
});

test("begin locks the assignment pointer before reading it", async () => {
  const harness = transactionHarness({
    setup: assignedSetup(),
    profile: { timezone: "Africa/Lagos" },
  });

  await beginProgrammeService(harness).beginProgramme(user);

  assert.deepEqual(harness.lockModes, ["pessimistic_write"]);
});

function gatedReader() {
  const reader = new RecordingProgrammeContentReader(["first-take"]);
  const findVersion = reader.findProgrammeVersion.bind(reader);
  reader.findProgrammeVersion = async (...args) => {
    const programme = await findVersion(...args);
    return programme && { ...programme, minimumTier: "pro" };
  };
  return reader;
}

test("begin refuses a new start above the user's plan, inside the transaction", async () => {
  const harness = transactionHarness({ setup: assignedSetup(), profile: { timezone: "UTC" } });
  const service = buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
    contentReader: gatedReader(),
    eligibility: { startRefusal: async () => "requires_upgrade" },
  });

  await assert.rejects(() => service.beginProgramme(user), /part of the Pro plan/);
  assert.deepEqual(harness.emitted, []);
});

test("begin starts a gated programme on a plan that covers it", async () => {
  const harness = transactionHarness({ setup: assignedSetup(), profile: { timezone: "UTC" } });
  const service = buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
    contentReader: gatedReader(),
    eligibility: { startRefusal: async () => null },
  });

  assert.equal((await service.beginProgramme(user)).programmeStarted, true);
});

test("begin refuses a locked programme the user has no unlock for", async () => {
  const harness = transactionHarness({ setup: assignedSetup(), profile: { timezone: "UTC" } });
  const service = buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
    eligibility: { startRefusal: async () => "locked" },
  });

  await assert.rejects(() => service.beginProgramme(user), /hasn't been unlocked/);
  assert.deepEqual(harness.emitted, []);
});

test("a gated programme already running is not re-checked against the plan", async () => {
  const harness = transactionHarness({
    setup: assignedSetup({ programmeStartedAt: new Date("2026-07-02T00:00:00.000Z") }),
  });
  const service = buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
    contentReader: gatedReader(),
    eligibility: { startRefusal: unreachable("eligibility.startRefusal") },
  });

  assert.equal((await service.beginProgramme(user)).programmeStarted, true);
});

test("an already-started programme emits and dispatches nothing", async () => {
  const harness = transactionHarness({
    setup: assignedSetup({
      programmeStartedAt: new Date("2026-07-02T00:00:00.000Z"),
      day1ScheduledFor: new Date("2026-07-03T00:00:00.000Z"),
    }),
    profile: { timezone: "Africa/Lagos" },
  });

  const status = await beginProgrammeService(harness).beginProgramme(user);

  assert.deepEqual(harness.emitted, []);
  assert.deepEqual(harness.dispatched, []);
  assert.equal(status.programmeStarted, true);
  assert.equal(
    status.day1ScheduledFor,
    "2026-07-03T00:00:00.000Z",
    "a repeat begin must not reschedule Day 1",
  );
});

test("losing the start race emits nothing and returns the winner's state", async () => {
  const winner = assignedSetup({
    programmeStartedAt: new Date("2026-07-02T00:00:00.000Z"),
    day1ScheduledFor: new Date("2026-07-03T00:00:00.000Z"),
  });
  const harness = transactionHarness({
    setup: assignedSetup(),
    profile: { timezone: "Africa/Lagos" },
    affected: 0,
    winner,
  });

  const status = await beginProgrammeService(harness).beginProgramme(user);

  assert.deepEqual(harness.emitted, []);
  assert.deepEqual(harness.dispatched, []);
  assert.equal(status.programmeStarted, true);
  assert.equal(status.day1ScheduledFor, "2026-07-03T00:00:00.000Z");
});

test("a failed emit rejects the begin so the start update rolls back", async () => {
  const harness = transactionHarness({
    setup: assignedSetup(),
    profile: { timezone: "Africa/Lagos" },
    emitFails: "outbox unavailable",
  });

  await assert.rejects(
    () => beginProgrammeService(harness).beginProgramme(user),
    /outbox unavailable/,
  );
  // The rejection propagates out of the transaction callback, which is what
  // makes the conditional update roll back with the event.
  assert.deepEqual(harness.dispatched, []);
});

test("a failed dispatch leaves the committed start reported as successful", async () => {
  const harness = transactionHarness({
    setup: assignedSetup(),
    profile: { timezone: "Africa/Lagos" },
    dispatchFails: "evaluator is not registered",
  });

  const status = await beginProgrammeService(harness).beginProgramme(user);

  // The event is durable and pending; the programme really did start, so
  // reporting a failure to the caller would be a lie.
  assert.equal(harness.emitted.length, 1);
  assert.deepEqual(harness.dispatched, ["programme.started:user-1:first-take"]);
  assert.equal(status.programmeStarted, true);
});

test("saving the Stage 2 Instagram mock never emits a Content Engine event", async () => {
  const harness = completionHarness();

  const status = await harness.service.saveStage2Answers(user, {
    instagramConnected: true,
  });

  // instagramConnected is a questionnaire answer, not a platform connection.
  // platform.connected belongs to the Instagram integration's own write path.
  // The emitter and dispatcher are `unreachable()` on this service, so
  // reaching either would have thrown rather than quietly passing.
  assert.equal(status.answers.instagramConnected, true);
  assert.deepEqual(harness.saves, []);
});

// ── Start by slug ──
//
// The per-programme start path. The matched programme keeps its assignment
// path; any other offered programme opens an assignment-less journey, one at
// a time, behind the same eligibility gate.

const offeredProgramme = { id: "brand-builder", title: "Brand Builder", durationDays: 30, access: "open" };

function slugStartService(
  harness: ReturnType<typeof transactionHarness>,
  options: {
    active?: { programmeSlug: string } | null;
    offered?: unknown;
    refusal?: string | null;
  } = {},
) {
  const started: Record<string, unknown>[] = [];
  const service = buildService({
    dataSource: harness.dataSource,
    emitter: harness.emitter,
    dispatcher: harness.dispatcher,
    enrolments: {
      findActiveForUpdate: async () => options.active ?? null,
      startInTransaction: async (_manager: unknown, input: Record<string, unknown>) => {
        started.push(input);
        return { id: "enrolment-9", created: true };
      },
    },
    eligibility: {
      findOffered: async (slug: string) =>
        "offered" in options ? options.offered : slug === offeredProgramme.id ? offeredProgramme : undefined,
      startRefusal: async () => options.refusal ?? null,
    },
  });

  return { service, started };
}

const startedSetup = () =>
  assignedSetup({
    programmeStartedAt: new Date("2026-07-02T00:00:00.000Z"),
    day1ScheduledFor: new Date("2026-07-03T00:00:00.000Z"),
  });

test("starting an offered programme opens a journey keyed by its enrolment and emits programme.started", async () => {
  const harness = transactionHarness({ setup: startedSetup(), profile: { timezone: "UTC" } });
  const { service, started } = slugStartService(harness);

  await service.startProgrammeBySlug(user, "brand-builder");

  assert.equal(started.length, 1);
  assert.equal(started[0].programmeSlug, "brand-builder");
  assert.equal(started[0].assignmentId, null);
  assert.equal(started[0].durationDays, 30);
  assert.deepEqual(harness.emitted.map((event) => event.eventId), [
    "programme.started:user-1:brand-builder:enrolment-9",
  ]);
  assert.deepEqual(harness.dispatched, ["programme.started:user-1:brand-builder:enrolment-9"]);
  assert.equal(harness.dispatchSawOpenTransaction, false);
});

test("a different programme cannot start while one is running; the running one is a no-op", async () => {
  const harness = transactionHarness({ setup: startedSetup(), profile: { timezone: "UTC" } });

  const other = slugStartService(harness, { active: { programmeSlug: "first-take" } });
  await assert.rejects(() => other.service.startProgrammeBySlug(user, "brand-builder"), /Finish your current programme/);

  const same = slugStartService(harness, { active: { programmeSlug: "brand-builder" } });
  await same.service.startProgrammeBySlug(user, "brand-builder");

  assert.equal(other.started.length + same.started.length, 0);
  assert.deepEqual(harness.emitted, []);
});

test("the server refuses a programme that is locked, above the plan, or not offered", async () => {
  const harness = transactionHarness({ setup: startedSetup(), profile: { timezone: "UTC" } });

  const locked = slugStartService(harness, { refusal: "locked" });
  await assert.rejects(() => locked.service.startProgrammeBySlug(user, "brand-builder"), /hasn't been unlocked/);

  const upgrade = slugStartService(harness, { refusal: "requires_upgrade" });
  await assert.rejects(() => upgrade.service.startProgrammeBySlug(user, "brand-builder"), /Upgrade to start it/);

  const missing = slugStartService(harness, { offered: undefined });
  await assert.rejects(() => missing.service.startProgrammeBySlug(user, "no-such-programme"), /isn't available/);

  assert.equal(locked.started.length + upgrade.started.length + missing.started.length, 0);
  assert.deepEqual(harness.emitted, []);
});

test("the matched programme's first start by slug goes through its assignment path", async () => {
  const harness = transactionHarness({ setup: assignedSetup(), profile: { timezone: "UTC" } });
  const { service } = slugStartService(harness);

  await service.startProgrammeBySlug(user, "first-take");

  assert.deepEqual(harness.emitted.map((event) => event.eventId), ["programme.started:user-1:first-take"]);
});

test("starting a programme before setup is complete is refused", async () => {
  const harness = transactionHarness({ setup: null });
  const { service } = slugStartService(harness);

  await assert.rejects(() => service.startProgrammeBySlug(user, "brand-builder"), /Finish the setup questionnaire/);
});
