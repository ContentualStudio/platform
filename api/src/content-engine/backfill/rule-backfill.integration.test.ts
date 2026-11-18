import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import databaseConfig from "../../config/database.config";
// Imported for its module side effect: it populates process.env from .env.local
// / .env so the guard compares against the developer's real DATABASE_URL.
import appDataSource from "../../database/data-source";
import { assertDisposableTestDatabase } from "../../database/test-database-guard";
import { ContentEngineEventEntity } from "../entities/content-engine-event.entity";
import { EngineRuleRepository } from "../engine-rule.repository";
import { ContentEventDispatcher } from "../event-dispatcher";
import { FiringLedgerService } from "../firing-ledger.service";
import type {
  RuleBackfillObservation,
  RuleEvaluationObserver,
} from "../rule-evaluation-observer.port";
import { RuleEvaluatorService } from "../rule-evaluator.service";
import { RuleFiringService } from "../rule-firing.service";
import { UserAttributeReaderFactory } from "../user-attribute.reader";
import { ContentEngineEffectRouter } from "../effects/content-engine-effect.dispatcher";
import {
  AwardBadgeHandler,
  InAppMessageHandler,
  PromptCallHandler,
  SuggestProgrammeHandler,
  UnlockProgrammeHandler,
} from "../effects/effect-handlers";
import { RuleBackfillRunRepository } from "./rule-backfill-run.repository";
import {
  BackfillRefusedError,
  RuleBackfillService,
} from "./rule-backfill.service";
import { noopProductAnalytics } from "../../observability/product-analytics.port";

/**
 * The real ledger, the real scanners, the real effect handlers and real rows.
 *
 * The claims that only a database can settle: that a backfill and a live firing
 * of the same rule collide on the unique index rather than both running, that
 * re-running one does nothing, and that a scanner's liveness predicate really
 * does leave a lapsed streak out.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
 *     yarn workspace @contentual/api test:integration
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const RULE_ID = "backfill-integration-rule";
const BADGE_ID = "backfill-integration-badge";
const USERS = ["backfill-user-a", "backfill-user-b", "backfill-user-c"];

let dataSource: DataSource;
let backfills: RuleBackfillObservation[] = [];

function observer(): RuleEvaluationObserver {
  return {
    async record() {},
    async recordRuleError() {},
    async recordBackfill(summary) {
      backfills.push(summary);
    },
  };
}

function router(): ContentEngineEffectRouter {
  return new ContentEngineEffectRouter(
    dataSource,
    new FiringLedgerService(dataSource.manager),
    noopProductAnalytics,
    new SuggestProgrammeHandler(),
    new UnlockProgrammeHandler(),
    new PromptCallHandler(),
    new AwardBadgeHandler(),
    new InAppMessageHandler({
      async createInAppNotification() {
        return null;
      },
    } as never),
  );
}

function backfillService(): RuleBackfillService {
  return new RuleBackfillService(
    dataSource.manager,
    new EngineRuleRepository(dataSource.manager),
    new RuleBackfillRunRepository(dataSource.manager),
    new UserAttributeReaderFactory(dataSource.manager),
    new RuleFiringService(
      new FiringLedgerService(dataSource.manager),
      router(),
    ),
    observer(),
  );
}

// The whole operator path: queue the request durably, then work it off. Both
// the CLI and the admin endpoint go through exactly these two calls.
async function backfill(options: Record<string, unknown> = {}) {
  const service = backfillService();

  await service.enqueue(RULE_ID, { pauseMs: 0, ...options });

  const summaries = await service.processQueued();

  return summaries[summaries.length - 1];
}

// The live path, so a backfilled firing can be shown to collide with a real one
// rather than with a stand-in for one.
function liveDispatcher(): ContentEventDispatcher {
  return new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    new RuleEvaluatorService(
      new EngineRuleRepository(dataSource.manager),
      new UserAttributeReaderFactory(dataSource.manager),
      new RuleFiringService(
        new FiringLedgerService(dataSource.manager),
        router(),
      ),
      observer(),
    ),
    noopProductAnalytics,
  );
}

async function seedRule(
  options: {
    triggerEvent?: string;
    conditions?: unknown[];
    active?: boolean;
    dedupeScope?: string;
  } = {},
) {
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams",
        "dedupeScope", "active")
     VALUES ($1, now(), now(), $1, $1, $2, $3::jsonb, $4, $5::jsonb, $6, $7)`,
    [
      RULE_ID,
      options.triggerEvent ?? eventNameTokens.streakReached,
      JSON.stringify(options.conditions ?? []),
      effectTypeTokens.awardBadge,
      JSON.stringify({ badgeSourceId: BADGE_ID }),
      options.dedupeScope ?? dedupeScopeTokens.oncePerUser,
      options.active ?? true,
    ],
  );
}

async function seedStreak(
  userId: string,
  options: { length: number; broken?: boolean; runOrdinal?: number },
) {
  await dataSource.query(
    `INSERT INTO "user_streak"
       ("userId", "lastActiveDate", "runStartedDate", "currentLength",
        "longestLength", "runOrdinal", "brokenAt")
     VALUES ($1, '2026-07-01', '2026-06-01', $2, $2, $3, $4)`,
    [
      userId,
      options.length,
      options.runOrdinal ?? 1,
      options.broken ? new Date() : null,
    ],
  );
}

async function awardedUsers(): Promise<string[]> {
  const rows = (await dataSource.query(
    `SELECT "userId" FROM "user_achievement" WHERE "badgeId" = $1 ORDER BY "userId"`,
    [BADGE_ID],
  )) as { userId: string }[];

  return rows.map((row) => row.userId);
}

async function ledgerStatuses(): Promise<{ userId: string; status: string }[]> {
  return (await dataSource.query(
    `SELECT "userId", "status" FROM "engine_firing_ledger"
      WHERE "ruleId" = $1 ORDER BY "userId"`,
    [RULE_ID],
  )) as { userId: string; status: string }[];
}

async function queuedRuns() {
  return (await dataSource.query(
    `SELECT "id", "status", "cursor", "candidatesScanned", "usersInScope", "usersFired"
       FROM "engine_rule_backfill_run" ORDER BY "createdAt"`,
  )) as {
    id: string;
    status: string;
    cursor: string | null;
    candidatesScanned: number;
    usersInScope: number | null;
    usersFired: number | null;
  }[];
}

before(async () => {
  if (skip) {
    return;
  }

  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();

  for (const userId of USERS) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
       ON CONFLICT ("id") DO NOTHING`,
      [userId, userId, `${userId}@example.test`],
    );
  }
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  backfills = [];

  for (const table of [
    "engine_rules",
    "engine_firing_ledger",
    "engine_rule_backfill_run_user",
    "engine_rule_backfill_run",
    "user_achievement",
    "badge_cooldown_queue",
    "user_streak",
    "programme_completion",
    "engine_badges",
  ]) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }

  await dataSource.query(
    `DELETE FROM "content_engine_events" WHERE "userId" = ANY($1)`,
    [USERS],
  );

  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "active")
     VALUES ($1, now(), now(), $1, 'Backfill Badge', true)`,
    [BADGE_ID],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(
    `DELETE FROM "content_engine_events" WHERE "userId" = ANY($1)`,
    [USERS],
  );
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [USERS]);
  await dataSource.destroy();
});

test("a backfill fires the rule for every user whose current state qualifies", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 12 });

  const result = await backfill();

  assert.equal(result.candidatesFired, 2);
  assert.deepEqual(await awardedUsers(), [USERS[0], USERS[1]]);
});

// The acceptance criterion about facts that are no longer true, against a real
// row rather than against the SQL string.
test("a streak that has since broken is not a candidate", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 30, broken: true });
  await seedStreak(USERS[1], { length: 3 });

  const result = await backfill();

  assert.equal(result.candidatesScanned, 1);
  assert.deepEqual(await awardedUsers(), [USERS[1]]);
});

test("conditions are evaluated exactly as the live evaluator would", { skip }, async () => {
  await seedRule({
    conditions: [
      {
        source: conditionSourceTokens.event,
        field: "streakLength",
        operator: operatorTokens.gte,
        value: 7,
      },
    ],
  });
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 3 });

  const result = await backfill();

  assert.equal(result.candidatesFired, 1);
  assert.equal(result.candidatesSkipped, 1);
  assert.deepEqual(await awardedUsers(), [USERS[0]]);
});

test("a user condition is read from app Postgres, same as live", { skip }, async () => {
  await seedRule({
    conditions: [
      {
        source: conditionSourceTokens.user,
        field: "programmes_completed",
        operator: operatorTokens.gte,
        value: 1,
      },
    ],
  });
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 10 });
  await dataSource.query(
    `INSERT INTO "programme_completion"
       ("assignmentId", "userId", "programmeId", "completionOrdinal")
     VALUES (gen_random_uuid(), $1, 'programme-1', 1)`,
    [USERS[0]],
  );

  await backfill();

  assert.deepEqual(await awardedUsers(), [USERS[0]]);
});

// The idempotency claim the whole design rests on.
test("re-running a backfill fires nothing a second time", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 12 });

  await backfill();
  const second = await backfill();

  assert.equal(second.candidatesFired, 0);
  assert.equal(second.candidatesScanned, 2);
  assert.deepEqual(second.skippedReasons, { already_fired: 2 });
  // The unique index is what enforces this; the counts above only report it.
  assert.deepEqual(await awardedUsers(), [USERS[0], USERS[1]]);
});

test("a user who already fired the rule live is skipped by the backfill", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 10 });

  // A real live delivery for one of the two users, through the outbox.
  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      "live-streak-event",
      eventNameTokens.streakReached,
      USERS[0],
      JSON.stringify({ userId: USERS[0], streakLength: 10 }),
    ],
  );
  await liveDispatcher().dispatchPending();

  assert.deepEqual(await awardedUsers(), [USERS[0]]);

  const result = await backfill();

  assert.equal(result.candidatesFired, 1);
  assert.deepEqual(result.skippedReasons, { already_fired: 1 });
  assert.deepEqual(await awardedUsers(), [USERS[0], USERS[1]]);
});

// The reverse order, which is the one the shared event ID exists for: under
// `every_time` the dedupe key is the event ID, so a backfilled key must be the
// same key the later live firing derives.
test("a live firing after a backfill does not repeat the effect", { skip }, async () => {
  await seedRule({ dedupeScope: dedupeScopeTokens.everyTime });
  await seedStreak(USERS[0], { length: 10, runOrdinal: 1 });

  await backfill();
  assert.deepEqual(await awardedUsers(), [USERS[0]]);

  // The same fact arriving live: the emitter's stable ID for a length-10 streak
  // on run 1, which is exactly what the scanner built.
  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      "streak.reached:" + USERS[0] + ":1:10",
      eventNameTokens.streakReached,
      USERS[0],
      JSON.stringify({ userId: USERS[0], streakLength: 10 }),
    ],
  );
  await liveDispatcher().dispatchPending();

  assert.deepEqual(await awardedUsers(), [USERS[0]]);
  assert.deepEqual(await ledgerStatuses(), [
    { userId: USERS[0], status: "fired" },
  ]);
});

test("a backfill writes no outbox row: it is not a replay of history", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });

  await backfill();

  const [{ count }] = (await dataSource.query(
    `SELECT COUNT(*)::int AS "count" FROM "content_engine_events"
      WHERE "userId" = ANY($1)`,
    [USERS],
  )) as { count: number }[];

  assert.equal(count, 0);
});

test("an inactive rule is refused at enqueue and fires nothing", { skip }, async () => {
  await seedRule({ active: false });
  await seedStreak(USERS[0], { length: 10 });

  await assert.rejects(
    () => backfillService().enqueue(RULE_ID, { pauseMs: 0 }),
    (error: unknown) =>
      error instanceof BackfillRefusedError &&
      error.refusal.reason === "rule_inactive",
  );

  assert.deepEqual(await awardedUsers(), []);
  assert.deepEqual(await ledgerStatuses(), []);
  assert.deepEqual(await queuedRuns(), []);
});

// The window the enqueue-time check cannot cover: a rule switched off between
// the request and a worker picking it up. That refusal is persisted, because by
// then the request had been legitimately accepted.
test("a rule deactivated after enqueue is refused by the worker, durably", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });

  const run = await backfillService().enqueue(RULE_ID, { pauseMs: 0 });

  await dataSource.query(
    `UPDATE "engine_rules" SET "active" = false WHERE "sourceDocumentId" = $1`,
    [RULE_ID],
  );

  const summaries = await backfillService().processQueued();

  assert.deepEqual(summaries, []);
  assert.deepEqual(await awardedUsers(), []);

  const stored = await new RuleBackfillRunRepository(
    dataSource.manager,
  ).findById(run.id);

  assert.equal(stored?.status, "refused");
  assert.equal(stored?.refusal, "rule_inactive");
});

// The operator asked twice, or clicked twice. Told, rather than handed a second
// run id that would never do anything.
test("a second live run for the same rule is refused", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });

  await backfillService().enqueue(RULE_ID, { pauseMs: 0 });

  await assert.rejects(
    () => backfillService().enqueue(RULE_ID, { pauseMs: 0 }),
    /already queued or running/,
  );
});

test("a dry run reserves nothing, so the real run afterwards still fires", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });

  const dry = await backfill({ dryRun: true });

  assert.equal(dry.candidatesScanned, 1);
  assert.deepEqual(await ledgerStatuses(), []);

  const real = await backfill();

  assert.equal(real.candidatesFired, 1);
  assert.deepEqual(await awardedUsers(), [USERS[0]]);
});

test("paging walks every user without repeating or skipping one", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  const result = await backfill({ pageSize: 1 });

  assert.equal(result.candidatesScanned, 3);
  assert.equal(result.candidatesFired, 3);
  assert.deepEqual(await awardedUsers(), [...USERS].sort());
});

test("the run is reported to observability with its real counts", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 10 });

  await backfill();

  assert.equal(backfills.length, 1);
  assert.equal(backfills[0].ruleId, RULE_ID);
  assert.equal(backfills[0].eventName, eventNameTokens.streakReached);
  assert.equal(backfills[0].candidatesFired, 2);
  assert.equal(backfills[0].stoppedBecause, "exhausted");
});

// P1: a capped run that could never advance. With the budget counting every
// candidate, the second pass would spend all of it re-skipping the users the
// first pass fired for and would never reach the third — reporting success
// while the rollout stayed stuck at one user.
test("a capped run makes forward progress on every pass", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  const capped = async () => {
    await dataSource.query(
      `TRUNCATE TABLE "engine_rule_backfill_run" CASCADE`,
    );
    await backfillService().enqueue(RULE_ID, {
      pauseMs: 0,
      pageSize: 1,
      maxCandidates: 1,
    });

    // One claim, so the budget is observable; a full worker pass would work the
    // yielded run straight off and finish the rollout.
    const [summary] = await backfillService().processQueued(1);
    return summary;
  };

  const first = await capped();
  assert.equal(first.candidatesFired, 1);
  assert.equal(first.stoppedBecause, "work_limit");

  const second = await capped();
  assert.equal(second.candidatesFired, 1);

  const third = await capped();
  assert.equal(third.candidatesFired, 1);

  assert.deepEqual(await awardedUsers(), [...USERS].sort());
});

// A budget is a yield point, not the end of the rollout: the worker finishes
// what it started without an operator noticing and asking again.
test("a worker pass finishes a capped rollout by itself", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  await backfillService().enqueue(RULE_ID, {
    pauseMs: 0,
    pageSize: 1,
    maxCandidates: 1,
  });

  const summaries = await backfillService().processQueued();

  assert.ok(summaries.length > 1, "the run should have yielded and resumed");
  assert.equal(summaries[summaries.length - 1].stoppedBecause, "exhausted");
  assert.deepEqual(await awardedUsers(), [...USERS].sort());

  const [run] = await queuedRuns();
  assert.equal(run.status, "succeeded");
});

// The durability the ticket asks for: progress outlives the process that made
// it, so a disconnect or a deploy costs at most one page.
test("progress is written to the run row after every page", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  await backfillService().enqueue(RULE_ID, {
    pauseMs: 0,
    pageSize: 1,
    maxCandidates: 1,
  });

  // Exactly one claim, then walk away as a killed worker would.
  await backfillService().processQueued(1);

  const [run] = await queuedRuns();

  assert.equal(run.status, "queued");
  assert.equal(run.candidatesScanned, 1);
  assert.notEqual(run.cursor, null);

  // A different service instance — a different process, in production — picks
  // it up and finishes it.
  await backfillService().processQueued();

  assert.deepEqual(await awardedUsers(), [...USERS].sort());
});

// The acceptance criteria are stated in users; the scan is expressed in
// candidates. `follower.milestone` is where they diverge most: one user with
// 10k followers clears three tiers, so three candidates.
test("user counts are reported separately from candidate counts", { skip }, async () => {
  await seedRule({ triggerEvent: eventNameTokens.followerMilestone });
  await dataSource.query(
    `INSERT INTO "follower_snapshot" ("userId", "platform", "localDate", "followerCount")
     VALUES ($1, 'instagram', '2026-07-01', 10000)`,
    [USERS[0]],
  );

  const result = await backfill();

  assert.equal(result.usersInScope, 1);
  // One user, three tiers cleared, one dedupe key (once_per_user) — so three
  // candidates, a single firing, and *one* user fired rather than three.
  assert.equal(result.usersFired, 1);
  assert.equal(result.usersSkipped, 0);
  assert.equal(result.candidatesScanned, 3);
  assert.equal(result.candidatesFired, 1);
  assert.equal(result.candidatesSkipped, 2);

  const [run] = await queuedRuns();
  assert.equal(run.usersInScope, 1);
  assert.equal(run.usersFired, 1);
});

// Counted from the ledger rather than tallied in the worker, so an interrupted
// rollout reports the same number a single pass would.
test("users fired survives a run being split across claims", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  await backfillService().enqueue(RULE_ID, {
    pauseMs: 0,
    pageSize: 1,
    maxCandidates: 1,
  });

  const summaries = await backfillService().processQueued();
  const final = summaries[summaries.length - 1];

  assert.equal(final.usersInScope, 3);
  assert.equal(final.usersFired, 3);
});

/**
 * P2: the summary must describe *this* rollout.
 *
 * Counting fired rows in the firing ledger cannot do that — the ledger records
 * that a rule fired for a user, never which rollout caused it. Here one user
 * fires live before any backfill exists, so a ledger-derived count would report
 * two users fired for a run that fired for one.
 */
test("users fired counts this run, not everyone who ever fired the rule", { skip }, async () => {
  await seedRule();
  await seedStreak(USERS[0], { length: 10 });
  await seedStreak(USERS[1], { length: 10 });

  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      "live-before-backfill",
      eventNameTokens.streakReached,
      USERS[0],
      JSON.stringify({ userId: USERS[0], streakLength: 10 }),
    ],
  );
  await liveDispatcher().dispatchPending();
  assert.deepEqual(await awardedUsers(), [USERS[0]]);

  const result = await backfill();

  // Two users in scope, one of whom this run actually fired for.
  assert.equal(result.usersInScope, 2);
  assert.equal(result.usersFired, 1);
  assert.equal(result.usersSkipped, 1);
  // The ledger holds two fired rows for this rule; the summary must not.
  const ledger = await ledgerStatuses();
  assert.equal(ledger.filter((row) => row.status === "fired").length, 2);
});

// A second run over an already-complete rollout fired for nobody, and must say
// so rather than inheriting the first run's numbers.
test("a re-run reports zero users fired, not the previous run's total", { skip }, async () => {
  await seedRule();
  for (const userId of USERS) {
    await seedStreak(userId, { length: 10 });
  }

  const first = await backfill();
  assert.equal(first.usersFired, 3);

  const second = await backfill();
  assert.equal(second.usersFired, 0);
  assert.equal(second.usersSkipped, 3);
  assert.equal(second.usersInScope, 3);
});

/**
 * P1: a prefix that keeps charging the budget must not starve what follows.
 *
 * These users all fail their condition, so none of them is `already_fired` and
 * every one of them costs budget on every pass. Under a mid-page rewind the
 * qualifying users behind them would be unreachable forever.
 */
test("a condition-skipped prefix cannot starve later candidates", { skip }, async () => {
  await seedRule({
    conditions: [
      {
        source: conditionSourceTokens.event,
        field: "streakLength",
        operator: operatorTokens.gte,
        value: 20,
      },
    ],
  });

  // Sorted by userId, so the two short streaks are scanned before the long one.
  await seedStreak(USERS[0], { length: 1 });
  await seedStreak(USERS[1], { length: 2 });
  await seedStreak(USERS[2], { length: 30 });

  await backfillService().enqueue(RULE_ID, {
    pauseMs: 0,
    pageSize: 3,
    maxCandidates: 2,
  });

  const [summary] = await backfillService().processQueued(1);

  // The page is finished rather than abandoned mid-way, so the qualifying user
  // behind the skipped prefix is reached on this claim.
  assert.deepEqual(await awardedUsers(), [USERS[2]]);
  assert.equal(summary.candidatesScanned, 3);
});
