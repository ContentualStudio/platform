import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import databaseConfig from "../config/database.config";
// Imported for its module side effect: it populates process.env from .env.local
// / .env, so databaseConfig() below reports the developer's real DATABASE_URL
// rather than the built-in fallback. Without it the guard would compare
// TEST_DATABASE_URL against a URL nobody uses.
import appDataSource from "../database/data-source";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import type { ContentEngineEffectDispatcher } from "./effect-dispatcher.port";
import { ContentEngineEventEntity } from "./entities/content-engine-event.entity";
import { EngineRuleRepository } from "./engine-rule.repository";
import { ContentEventDispatcher } from "./event-dispatcher";
import { FiringLedgerService } from "./firing-ledger.service";
import type {
  RuleEvaluationObservation,
  RuleEvaluationObserver,
  RuleEvaluationRuleError,
} from "./rule-evaluation-observer.port";
import { RuleEvaluatorService } from "./rule-evaluator.service";
import { RuleFiringService } from "./rule-firing.service";
import { UserAttributeReaderFactory } from "./user-attribute.reader";
import { noopProductAnalytics } from "../observability/product-analytics.port";

// These prove the composition a fake repository cannot: real rule selection
// against real rows, a real ledger reservation taken before the effect and
// completed by the handler, and a real outbox row that stays retryable when a
// handler throws.
//
// The effect dispatcher here is a fake, but it is the only fake in the chain —
// it writes to a scratch table and completes the *real* reservation, which is
// exactly the contract the production handlers must honour.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
//
// See docs/database.md. Without the variable the whole file skips, so the
// default unit-test run stays green on a machine with no database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "rule-evaluator-integration-user";
const PROGRAMME_ID = "programme-1";
const EVENT_ID = "rule-evaluator-integration-event";
const SCRATCH_TABLE = "rule_evaluator_scratch_effect";

const QUALIFYING = "rule-qualifying";
const NON_QUALIFYING = "rule-non-qualifying";
const INACTIVE = "rule-inactive";
const WRONG_TRIGGER = "rule-wrong-trigger";

let dataSource: DataSource;

// Records every statement the evaluator issues so the read-only boundary can be
// asserted against real traffic rather than against the source string.
let executedSql: string[] = [];

function recordingManager(manager: EntityManager): EntityManager {
  return new Proxy(manager, {
    get(target, property, receiver) {
      if (property === "query") {
        return async (sql: string, parameters?: unknown[]) => {
          executedSql.push(sql);
          return manager.query(sql, parameters);
        };
      }

      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

interface SeedRule {
  id: string;
  triggerEvent: string;
  active: boolean;
  conditions?: unknown[];
  dedupeScope?: string;
}

async function seedRule(rule: SeedRule) {
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams",
        "dedupeScope", "active")
     VALUES ($1, now(), now(), $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9)`,
    [
      rule.id,
      rule.id,
      rule.id,
      rule.triggerEvent,
      JSON.stringify(rule.conditions ?? []),
      effectTypeTokens.awardBadge,
      JSON.stringify({ badgeKey: rule.id }),
      rule.dedupeScope ?? dedupeScopeTokens.oncePerUser,
      rule.active,
    ],
  );
}

async function seedStandardRules() {
  // Matches the event and its payload.
  await seedRule({ id: QUALIFYING, triggerEvent: eventNameTokens.taskCompleted, active: true });
  // Right trigger, but its condition does not hold for this payload.
  await seedRule({
    id: NON_QUALIFYING,
    triggerEvent: eventNameTokens.taskCompleted,
    active: true,
    conditions: [
      {
        source: conditionSourceTokens.event,
        field: "contentType",
        operator: operatorTokens.eq,
        value: "carousel",
      },
    ],
  });
  // Right trigger, switched off.
  await seedRule({ id: INACTIVE, triggerEvent: eventNameTokens.taskCompleted, active: false });
  // Active, listening for a different event.
  await seedRule({ id: WRONG_TRIGGER, triggerEvent: eventNameTokens.streakReached, active: true });
}

async function seedPendingEvent() {
  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      EVENT_ID,
      eventNameTokens.taskCompleted,
      USER_ID,
      JSON.stringify({
        userId: USER_ID,
        programmeId: PROGRAMME_ID,
        taskId: "task-1",
        contentType: "video",
      }),
    ],
  );
}

interface Harness {
  dispatcher: ContentEventDispatcher;
  dispatchedRuleIds: string[];
  summaries: RuleEvaluationObservation[];
  ruleErrors: RuleEvaluationRuleError[];
}

function buildHarness(
  options: { failFor?: string; staleLeaseFor?: string } = {},
): Harness {
  const dispatchedRuleIds: string[] = [];
  const summaries: RuleEvaluationObservation[] = [];
  const ruleErrors: RuleEvaluationRuleError[] = [];

  const ledger = new FiringLedgerService(dataSource.manager);

  // Stands in for a production handler, and honours the same contract: write
  // the effect and complete the reservation in one transaction, so a failure
  // leaves neither behind.
  const effects: ContentEngineEffectDispatcher = {
    async dispatch({ rule, event, reservation }) {
      dispatchedRuleIds.push(rule.id);

      await dataSource.transaction(async (manager) => {
        // The write happens first so a failure below has something to roll
        // back. Failing before it would only prove that unreached code does not
        // run, which is not what these tests are for.
        await manager.query(
          `INSERT INTO "${SCRATCH_TABLE}" ("ruleId", "userId") VALUES ($1, $2)`,
          [rule.id, event.userId],
        );

        if (options.failFor === rule.id) {
          throw new Error(`effect failed for ${rule.id}`);
        }

        // A superseded lease token makes the real ledger refuse the completion
        // and throw — the production failure this contract exists to survive.
        await ledger.markFiredOrThrow(
          event.userId,
          reservation.ledgerId,
          options.staleLeaseFor === rule.id
            ? "00000000-0000-0000-0000-000000000000"
            : reservation.leaseToken,
          manager,
        );
      });
    },
  };

  const observer: RuleEvaluationObserver = {
    async record(summary) {
      summaries.push(summary);
    },
    async recordRuleError(input) {
      ruleErrors.push(input);
    },
    async recordBackfill() {
      throw new Error("the evaluator never reports a backfill");
    },
  };

  const evaluator = new RuleEvaluatorService(
    new EngineRuleRepository(recordingManager(dataSource.manager)),
    new UserAttributeReaderFactory(dataSource.manager),
    new RuleFiringService(ledger, effects),
    observer,
  );

  return {
    dispatcher: new ContentEventDispatcher(
      dataSource.getRepository(ContentEngineEventEntity),
      evaluator,
      noopProductAnalytics,
    ),
    dispatchedRuleIds,
    summaries,
    ruleErrors,
  };
}

async function outboxRow() {
  const [row] = (await dataSource.query(
    `SELECT "status", "attemptCount", "lastError", "deliveredAt"
     FROM "content_engine_events" WHERE "id" = $1`,
    [EVENT_ID],
  )) as {
    status: string;
    attemptCount: number;
    lastError: string | null;
    deliveredAt: Date | null;
  }[];

  return row;
}

async function ledgerRows() {
  return (await dataSource.query(
    `SELECT "ruleId", "status" FROM "engine_firing_ledger"
     WHERE "userId" = $1 ORDER BY "ruleId"`,
    [USER_ID],
  )) as { ruleId: string; status: string }[];
}

async function scratchRows() {
  return (await dataSource.query(
    `SELECT "ruleId" FROM "${SCRATCH_TABLE}" ORDER BY "ruleId"`,
  )) as { ruleId: string }[];
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
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "${SCRATCH_TABLE}" (
      "ruleId" text PRIMARY KEY,
      "userId" text NOT NULL
    )
  `);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, USER_ID, `${USER_ID}@example.test`],
  );
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  executedSql = [];
  await dataSource.query(`TRUNCATE TABLE "engine_rules"`);
  await dataSource.query(`TRUNCATE TABLE "engine_firing_ledger"`);
  await dataSource.query(`TRUNCATE TABLE "${SCRATCH_TABLE}"`);
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [
    USER_ID,
  ]);
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(`DROP TABLE IF EXISTS "${SCRATCH_TABLE}"`);
  await dataSource.query(`TRUNCATE TABLE "engine_rules"`);
  await dataSource.query(`TRUNCATE TABLE "engine_firing_ledger"`);
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [
    USER_ID,
  ]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("only the active, matching, qualifying rule reaches an effect handler", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();

  assert.deepEqual(harness.dispatchedRuleIds, [QUALIFYING]);
  assert.deepEqual(
    (await scratchRows()).map((row) => row.ruleId),
    [QUALIFYING],
  );
});

test("the reservation is taken before the effect and completed by the handler", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.deepEqual(await ledgerRows(), [
    { ruleId: QUALIFYING, status: "fired" },
  ]);
});

test("a non-qualifying rule reserves nothing", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  const reserved = (await ledgerRows()).map((row) => row.ruleId);
  assert.ok(!reserved.includes(NON_QUALIFYING));
  assert.ok(!reserved.includes(INACTIVE));
  assert.ok(!reserved.includes(WRONG_TRIGGER));
});

test("the outbox row becomes delivered", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  const row = await outboxRow();
  assert.equal(row.status, "delivered");
  assert.ok(row.deliveredAt instanceof Date);
});

test("a throwing handler does not stop a later rule, and keeps the event retryable", { skip }, async () => {
  await seedRule({ id: "rule-a-fails", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedRule({ id: "rule-b-fires", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedPendingEvent();

  const harness = buildHarness({ failFor: "rule-a-fails" });
  await harness.dispatcher.dispatchPending();

  // The later rule still ran and still wrote its effect.
  assert.deepEqual(
    (await scratchRows()).map((row) => row.ruleId),
    ["rule-b-fires"],
  );

  // The failed rule's reservation stays `reserved`, so the ledger's lease rules
  // — not the evaluator — decide whether it may be retried.
  assert.deepEqual(await ledgerRows(), [
    { ruleId: "rule-a-fails", status: "reserved" },
    { ruleId: "rule-b-fires", status: "fired" },
  ]);

  // The failed rule's work is unfinished, so the event stays retryable rather
  // than being acknowledged with an effect that never ran.
  assert.equal((await outboxRow()).status, "pending");
  assert.equal(harness.ruleErrors[0].ruleId, "rule-a-fails");
  assert.equal(harness.ruleErrors[0].stage, "effect");
});

test("a failed effect rolls back its own write", { skip }, async () => {
  await seedRule({ id: "rule-a-fails", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedPendingEvent();

  const harness = buildHarness({ failFor: "rule-a-fails" });

  // Guard against this test going vacuous again: the handler must genuinely
  // have run and written before the failure, or an empty scratch table proves
  // nothing about rollback.
  await harness.dispatcher.dispatchPending();
  assert.deepEqual(harness.dispatchedRuleIds, ["rule-a-fails"]);

  assert.deepEqual(await scratchRows(), []);
  assert.deepEqual(await ledgerRows(), [
    { ruleId: "rule-a-fails", status: "reserved" },
  ]);
});

test("a refused ledger completion rolls back the effect write", { skip }, async () => {
  await seedRule({ id: "rule-stale", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedPendingEvent();

  const harness = buildHarness({ staleLeaseFor: "rule-stale" });
  await harness.dispatcher.dispatchPending();

  assert.deepEqual(harness.dispatchedRuleIds, ["rule-stale"]);

  // The effect and its ledger completion share one transaction, so a refused
  // completion must take the effect with it. Otherwise a handler whose lease
  // was stolen would apply its effect twice.
  assert.deepEqual(await scratchRows(), []);
  assert.deepEqual(await ledgerRows(), [
    { ruleId: "rule-stale", status: "reserved" },
  ]);
  assert.equal(harness.ruleErrors[0].stage, "effect");
  assert.match(harness.ruleErrors[0].error, /stale_reservation/);

  // A stolen lease is transient: the event must come back so the effect can be
  // applied under a fresh reservation.
  assert.equal((await outboxRow()).status, "pending");
});

test("the scratch write really does commit when the effect succeeds", { skip }, async () => {
  // The negative rollback assertions above are only meaningful if this write is
  // observable in the first place.
  await seedRule({ id: "rule-commits", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.deepEqual(
    (await scratchRows()).map((row) => row.ruleId),
    ["rule-commits"],
  );
});

test("an unparseable mirror row is reported and later rules still fire", { skip }, async () => {
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams",
        "dedupeScope", "active")
     VALUES ('rule-broken', now(), now(), 'rule-broken', 'rule-broken', $1,
             '[]'::jsonb, 'detonate', '{}'::jsonb, $2, true)`,
    [eventNameTokens.taskCompleted, dedupeScopeTokens.oncePerUser],
  );
  await seedRule({ id: "rule-zzz-good", triggerEvent: eventNameTokens.taskCompleted, active: true });
  await seedPendingEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();

  assert.deepEqual(
    (await scratchRows()).map((row) => row.ruleId),
    ["rule-zzz-good"],
  );
  assert.equal(harness.ruleErrors[0].ruleId, "rule-broken");
  assert.equal(harness.ruleErrors[0].stage, "parse");
  assert.equal((await outboxRow()).status, "delivered");
});

test("replaying a delivered event does not fire the rule twice", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  // Force the row back to pending, as an at-least-once redelivery would.
  await dataSource.query(
    `UPDATE "content_engine_events"
        SET "status" = 'pending', "deliveredAt" = NULL, "claimToken" = NULL,
            "claimedUntil" = NULL, "availableAt" = now()
      WHERE "id" = $1`,
    [EVENT_ID],
  );

  const replay = buildHarness();
  await replay.dispatcher.dispatchPending();

  // The rule was considered again, but the ledger refused a second firing.
  assert.deepEqual(replay.dispatchedRuleIds, []);
  assert.deepEqual(
    (await scratchRows()).map((row) => row.ruleId),
    [QUALIFYING],
  );
  // The non-qualifying rule is skipped again for its own reason; the point here
  // is that the previously fired rule is refused by the ledger, not by chance.
  assert.deepEqual(
    replay.summaries[0].skipped.find((entry) => entry.ruleId === QUALIFYING),
    { ruleId: QUALIFYING, reason: "already_fired" },
  );
});

test("the summary names every considered and fired rule", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();
  const summary = harness.summaries[0];

  // Only active rules on this trigger are ever considered.
  assert.deepEqual(summary.consideredRuleIds, [NON_QUALIFYING, QUALIFYING]);
  assert.deepEqual(summary.qualifiedRuleIds, [QUALIFYING]);
  assert.deepEqual(summary.firedRuleIds, [QUALIFYING]);
  assert.deepEqual(
    summary.skipped.map((entry) => entry.ruleId),
    [NON_QUALIFYING],
  );
  assert.equal(summary.eventId, EVENT_ID);
  assert.equal(summary.userId, USER_ID);
});

test("engine_rules is only ever read", { skip }, async () => {
  await seedStandardRules();
  await seedPendingEvent();

  await buildHarness().dispatcher.dispatchPending();

  const touchingRules = executedSql.filter((sql) => sql.includes("engine_rules"));
  assert.ok(touchingRules.length > 0, "the evaluator must have read the mirror");

  for (const sql of touchingRules) {
    const upper = sql.toUpperCase();
    assert.ok(upper.includes("SELECT"));

    for (const verb of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ALTER", "DROP"]) {
      assert.ok(!upper.includes(verb), `${verb} must not be issued against engine_rules`);
    }
  }
});
