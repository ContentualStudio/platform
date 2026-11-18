import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  type EffectType,
} from "@contentual/content-engine-vocabulary";
import databaseConfig from "../../config/database.config";
// Imported for its module side effect: it populates process.env from .env.local
// / .env so the guard compares against the developer's real DATABASE_URL.
import appDataSource from "../../database/data-source";
import { assertDisposableTestDatabase } from "../../database/test-database-guard";
import { InAppNotificationEntity } from "../../notifications/entities/in-app-notification.entity";
import { NotificationPreferenceEntity } from "../../notifications/entities/notification-preference.entity";
import { NotificationsService } from "../../notifications/notifications.service";
import { ContentEngineEventEntity } from "../entities/content-engine-event.entity";
import { EngineRuleRepository } from "../engine-rule.repository";
import { ContentEventDispatcher } from "../event-dispatcher";
import { FiringLedgerService } from "../firing-ledger.service";
import type {
  RuleEvaluationObservation,
  RuleEvaluationObserver,
  RuleEvaluationRuleError,
} from "../rule-evaluation-observer.port";
import { RuleEvaluatorService } from "../rule-evaluator.service";
import { RuleFiringService } from "../rule-firing.service";
import { UserAttributeReaderFactory } from "../user-attribute.reader";
import { ContentEngineEffectRouter } from "./content-engine-effect.dispatcher";
import {
  AwardBadgeHandler,
  InAppMessageHandler,
  PromptCallHandler,
  SuggestProgrammeHandler,
  UnlockProgrammeHandler,
} from "./effect-handlers";
import { noopProductAnalytics } from "../../observability/product-analytics.port";

// The real handlers, the real router, the real ledger and the real evaluator
// against real tables. Nothing here is faked except the observer, which only
// records what would have gone to PostHog.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

const USER_ID = "effect-handlers-integration-user";
const PROGRAMME_ID = "programme-target";
const BADGE_ID = "badge-target";
const CALL_TYPE_ID = "call-type-target";
const EVENT_ID = "effect-handlers-integration-event";

let dataSource: DataSource;

interface Harness {
  dispatcher: ContentEventDispatcher;
  summaries: RuleEvaluationObservation[];
  ruleErrors: RuleEvaluationRuleError[];
}

function buildHarness(): Harness {
  const summaries: RuleEvaluationObservation[] = [];
  const ruleErrors: RuleEvaluationRuleError[] = [];
  const ledger = new FiringLedgerService(dataSource.manager);

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

  const notificationsService = new NotificationsService(
    dataSource.getRepository(NotificationPreferenceEntity),
    dataSource.getRepository(InAppNotificationEntity),
    dataSource,
    {
      async enqueue(manager, userId, event) {
        await manager.query(
          "SELECT pg_notify('contentual_in_app_notifications', $1)",
          [
            JSON.stringify({
              userId,
              type: event.type,
              notificationId:
                event.type === "notification.dismissed"
                  ? event.notificationId
                  : event.type === "notification.created" ||
                      event.type === "notification.updated"
                    ? event.notification.id
                    : undefined,
              unreadCount: event.type === "heartbeat" ? 0 : event.unreadCount,
            }),
          ],
        );
      },
    } as never,
  );

  const router = new ContentEngineEffectRouter(
    dataSource,
    ledger,
    noopProductAnalytics,
    new SuggestProgrammeHandler(),
    new UnlockProgrammeHandler(),
    new PromptCallHandler(),
    new AwardBadgeHandler(),
    new InAppMessageHandler(notificationsService),
  );

  const evaluator = new RuleEvaluatorService(
    new EngineRuleRepository(dataSource.manager),
    new UserAttributeReaderFactory(dataSource.manager),
    new RuleFiringService(ledger, router),
    observer,
  );

  return {
    dispatcher: new ContentEventDispatcher(
      dataSource.getRepository(ContentEngineEventEntity),
      evaluator,
      noopProductAnalytics,
    ),
    summaries,
    ruleErrors,
  };
}

async function seedRule(
  id: string,
  effectType: EffectType,
  effectParams: Record<string, unknown>,
) {
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams",
        "dedupeScope", "active")
     VALUES ($1, now(), now(), $1, $1, $2, '[]'::jsonb, $3, $4::jsonb, $5, true)`,
    [
      id,
      eventNameTokens.taskCompleted,
      effectType,
      JSON.stringify(effectParams),
      dedupeScopeTokens.oncePerUser,
    ],
  );
}

async function seedEvent(id = EVENT_ID) {
  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      id,
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

async function rows(table: string) {
  return (await dataSource.query(
    `SELECT * FROM "${table}" WHERE "userId" = $1`,
    [USER_ID],
  )) as Record<string, unknown>[];
}

async function outboxStatus(id = EVENT_ID) {
  const [row] = (await dataSource.query(
    `SELECT "status" FROM "content_engine_events" WHERE "id" = $1`,
    [id],
  )) as { status: string }[];
  return row?.status;
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

  for (const table of [
    "engine_rules",
    "engine_firing_ledger",
    "engine_programme_suggestion",
    "engine_programme_unlock",
    "engine_call_prompt",
    "engine_in_app_message",
    "in_app_notification",
    // The opt-out test inserts a preference row for this user. Without it here
    // the suite passes once and fails on every run after, because the insert
    // has no ON CONFLICT and the row survives.
    "notification_preference",
    "user_achievement",
    "badge_cooldown_queue",
    "programme",
    "engine_badges",
    "engine_call_types",
  ]) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await dataSource.query(
    `DELETE FROM "content_engine_events" WHERE "userId" = $1`,
    [USER_ID],
  );

  // The CMS-owned targets the handlers validate against.
  await dataSource.query(
    `INSERT INTO "programme"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title")
     VALUES ($1, now(), now(), $1, 'Target Programme')`,
    [PROGRAMME_ID],
  );
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "active")
     VALUES ($1, now(), now(), $1, 'Target Badge', true)`,
    [BADGE_ID],
  );
  await dataSource.query(
    `INSERT INTO "engine_call_types"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "active")
     VALUES ($1, now(), now(), $1, 'Target Call', true)`,
    [CALL_TYPE_ID],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await dataSource.query(
    `DELETE FROM "content_engine_events" WHERE "userId" = $1`,
    [USER_ID],
  );
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test("all five v1 effects write their per-user record", { skip }, async () => {
  await seedRule("rule-1-suggest", effectTypeTokens.suggestProgramme, {
    programmeSourceId: PROGRAMME_ID,
  });
  await seedRule("rule-2-unlock", effectTypeTokens.unlockProgramme, {
    programmeSourceId: PROGRAMME_ID,
  });
  await seedRule("rule-3-call", effectTypeTokens.promptCall, {
    callTypeSourceId: CALL_TYPE_ID,
  });
  await seedRule("rule-4-badge", effectTypeTokens.awardBadge, {
    badgeSourceId: BADGE_ID,
  });
  await seedRule("rule-5-message", effectTypeTokens.inAppMessage, {
    message: "Great work this week",
  });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("engine_programme_suggestion")).length, 1);
  assert.equal((await rows("engine_programme_unlock")).length, 1);
  assert.equal((await rows("engine_call_prompt")).length, 1);
  assert.equal((await rows("engine_in_app_message")).length, 1);
  const [notification] = await rows("in_app_notification");
  assert.equal(notification.notificationType, null);
  assert.equal(notification.message, "Great work this week");
  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});

test("a typed in-app preference opt-out keeps the engine trace but skips the inbox", { skip }, async () => {
  await dataSource.query(
    `INSERT INTO "notification_preference"
       ("userId", "notificationType", "channel", "optedOut")
     VALUES ($1, 'badge_earned', 'in_app', true)`,
    [USER_ID],
  );
  await seedRule("rule-opted-out", effectTypeTokens.inAppMessage, {
    notificationType: "badge_earned",
    title: "Badge earned",
    message: "You unlocked a badge.",
  });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("engine_in_app_message")).length, 1);
  assert.equal((await rows("in_app_notification")).length, 0);
  assert.equal(await outboxStatus(), "delivered");
});

test("award_badge is idempotent for (user, badge) across rules", { skip }, async () => {
  // Two different rules awarding the same badge: the ledger keys on the rule,
  // so only the achievement's unique index can stop the duplicate.
  await seedRule("rule-a", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedRule("rule-b", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal(
    (await rows("badge_cooldown_queue")).length,
    1,
    "a duplicate award must not queue a second celebration",
  );
});

test("award_badge enqueues the celebration as queued, never released", { skip }, async () => {
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  const [queued] = await rows("badge_cooldown_queue");
  assert.equal(queued.status, "queued");
  assert.equal(queued.releasedAt, null);
  assert.equal(queued.badgeId, BADGE_ID);
});

test("grant_call is reported invalid and never executed", { skip }, async () => {
  await seedRule("rule-grant", effectTypeTokens.grantCall, {});
  await seedRule("rule-ok", effectTypeTokens.inAppMessage, { message: "still runs" });
  await seedEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();

  const failed = harness.summaries[0].failed;
  assert.deepEqual(
    failed.map((entry) => entry.ruleId),
    ["rule-grant"],
  );
  assert.match(failed[0].error, /grant_call/);

  // The reservation stays unmarked, so nothing is recorded as having fired.
  const [ledgerRow] = (await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "ruleId" = $1`,
    ["rule-grant"],
  )) as { status: string }[];
  assert.equal(ledgerRow.status, "reserved");

  // And the other rule is unaffected.
  assert.equal((await rows("engine_in_app_message")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});

test("an invalid parameter is reported without affecting other rules", { skip }, async () => {
  // A genuinely malformed rule: no badge named at all, which no amount of
  // mirror synchronisation will fix.
  await seedRule("rule-bad", effectTypeTokens.awardBadge, {});
  await seedRule("rule-good", effectTypeTokens.inAppMessage, { message: "fine" });
  await seedEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();

  assert.equal(harness.ruleErrors[0].ruleId, "rule-bad");
  assert.equal(harness.ruleErrors[0].stage, "effect");
  assert.equal((await rows("user_achievement")).length, 0);
  assert.equal((await rows("engine_in_app_message")).length, 1);

  // The originating write path is untouched: the event still delivers.
  assert.equal(await outboxStatus(), "delivered");
});

test("an inactive badge is not awarded, and the event is acknowledged", { skip }, async () => {
  // The badge's row is mirrored and says active = false. That is an editorial
  // decision, not a synchronisation lag, so waiting for it to change would
  // leave the event pending until somebody happens to re-enable the badge.
  await dataSource.query(`UPDATE "engine_badges" SET "active" = false`);
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  const harness = buildHarness();
  await harness.dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 0);
  assert.equal((await rows("badge_cooldown_queue")).length, 0);
  assert.equal(await outboxStatus(), "delivered");

  assert.equal(harness.ruleErrors[0].stage, "effect");
  assert.match(harness.ruleErrors[0].error, /inactive/);
});

test("an inactive call type is not prompted, and the event is acknowledged", { skip }, async () => {
  await dataSource.query(`UPDATE "engine_call_types" SET "active" = false`);
  await seedRule("rule-call", effectTypeTokens.promptCall, {
    callTypeSourceId: CALL_TYPE_ID,
  });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("engine_call_prompt")).length, 0);
  assert.equal(await outboxStatus(), "delivered");
});

test("a rule mirrored before its target still fires once the target lands", { skip }, async () => {
  // The mirrors synchronise independently on a roughly one-minute job, so a
  // rule legitimately reaches app Postgres before the badge it names. The row
  // is absent — not present-and-inactive — which is what makes this a race
  // rather than a decision.
  await dataSource.query(`TRUNCATE TABLE "engine_badges" CASCADE`);
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  // 1. The rule is here; its target is not.
  await buildHarness().dispatcher.dispatchPending();

  // 2. Nothing awarded, and the event is still pending rather than delivered.
  assert.equal((await rows("user_achievement")).length, 0);
  assert.equal(await outboxStatus(), "pending");

  const [heldReservation] = (await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "ruleId" = $1`,
    ["rule-badge"],
  )) as { status: string }[];
  assert.equal(heldReservation.status, "reserved");

  // 3. The badge's mirror job lands.
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "active")
     VALUES ($1, now(), now(), $1, 'Target Badge', true)`,
    [BADGE_ID],
  );

  // The retry becomes due and the previous attempt's lease has expired.
  await dataSource.query(`UPDATE "content_engine_events" SET "availableAt" = now()`);
  await dataSource.query(
    `UPDATE "engine_firing_ledger" SET "reservedAt" = now() - interval '1 hour'`,
  );

  // 4. The replay fires the effect and the event completes.
  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal((await rows("badge_cooldown_queue")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});

test("a programme suggested before its programme mirrors still fires later", { skip }, async () => {
  await dataSource.query(`TRUNCATE TABLE "programme" CASCADE`);
  await seedRule("rule-suggest", effectTypeTokens.suggestProgramme, {
    programmeSourceId: PROGRAMME_ID,
  });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("engine_programme_suggestion")).length, 0);
  assert.equal(await outboxStatus(), "pending");

  await dataSource.query(
    `INSERT INTO "programme"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "slug", "title")
     VALUES ($1, now(), now(), $1, 'Target Programme')`,
    [PROGRAMME_ID],
  );
  await dataSource.query(`UPDATE "content_engine_events" SET "availableAt" = now()`);
  await dataSource.query(
    `UPDATE "engine_firing_ledger" SET "reservedAt" = now() - interval '1 hour'`,
  );

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("engine_programme_suggestion")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});

test("a successful effect marks its reservation fired", { skip }, async () => {
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  const [ledgerRow] = (await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "ruleId" = $1`,
    ["rule-badge"],
  )) as { status: string }[];
  assert.equal(ledgerRow.status, "fired");
});

test("a replayed event does not award the badge twice", { skip }, async () => {
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();
  await dataSource.query(
    `UPDATE "content_engine_events"
        SET "status" = 'pending', "deliveredAt" = NULL, "claimToken" = NULL,
            "claimedUntil" = NULL, "availableAt" = now()
      WHERE "id" = $1`,
    [EVENT_ID],
  );
  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal((await rows("badge_cooldown_queue")).length, 1);
});

test("an invalid parameter writes nothing at all for that rule", { skip }, async () => {
  // award_badge writes two rows; a failure after the first must roll it back.
  await seedRule("rule-bad", effectTypeTokens.awardBadge, {});
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 0);
  assert.equal((await rows("badge_cooldown_queue")).length, 0);
});

test("a transient effect failure leaves the event pending, not delivered", { skip }, async () => {
  await seedRule("rule-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  // Hiding the table makes the handler's INSERT fail the way a real outage
  // would — an ordinary database error rather than a parameter problem, so it
  // is classified transient.
  await dataSource.query(`ALTER TABLE "user_achievement" RENAME TO "user_achievement_hidden"`);

  try {
    await buildHarness().dispatcher.dispatchPending();
  } finally {
    await dataSource.query(`ALTER TABLE "user_achievement_hidden" RENAME TO "user_achievement"`);
  }

  // The failure was transient, so the event must remain retryable.
  assert.equal(await outboxStatus(), "pending");

  const [ledgerRow] = (await dataSource.query(
    `SELECT "status" FROM "engine_firing_ledger" WHERE "ruleId" = $1`,
    ["rule-badge"],
  )) as { status: string }[];
  assert.equal(ledgerRow.status, "reserved");
});

test("a permanent effect failure still delivers the event", { skip }, async () => {
  // A rule naming no badge at all fails identically forever.
  await seedRule("rule-bad", effectTypeTokens.awardBadge, {});
  await seedEvent();

  await buildHarness().dispatcher.dispatchPending();

  assert.equal(await outboxStatus(), "delivered");
});

test("an every_time effect survives a transient failure", { skip }, async () => {
  // The regression this guards: every_time keys its dedupe scope on the event
  // id, so an event marked delivered after a failure loses the firing forever.
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams",
        "dedupeScope", "active")
     VALUES ('rule-every', now(), now(), 'rule-every', 'rule-every', $1,
             '[]'::jsonb, $2, $3::jsonb, $4, true)`,
    [
      eventNameTokens.taskCompleted,
      effectTypeTokens.awardBadge,
      JSON.stringify({ badgeSourceId: BADGE_ID }),
      dedupeScopeTokens.everyTime,
    ],
  );
  await seedEvent();

  await dataSource.query(`ALTER TABLE "user_achievement" RENAME TO "user_achievement_hidden"`);
  try {
    await buildHarness().dispatcher.dispatchPending();
  } finally {
    await dataSource.query(`ALTER TABLE "user_achievement_hidden" RENAME TO "user_achievement"`);
  }

  assert.equal((await rows("user_achievement")).length, 0);
  assert.equal(await outboxStatus(), "pending");

  // Make it due again and let the lease be reclaimable, as the retry sweep
  // would once the backoff elapses.
  await dataSource.query(`UPDATE "content_engine_events" SET "availableAt" = now()`);
  await dataSource.query(
    `UPDATE "engine_firing_ledger" SET "reservedAt" = now() - interval '1 hour'`,
  );

  await buildHarness().dispatcher.dispatchPending();

  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});

test("a retry re-runs only the failed rule", { skip }, async () => {
  await seedRule("rule-a-message", effectTypeTokens.inAppMessage, { message: "once only" });
  await seedRule("rule-b-badge", effectTypeTokens.awardBadge, { badgeSourceId: BADGE_ID });
  await seedEvent();

  await dataSource.query(`ALTER TABLE "user_achievement" RENAME TO "user_achievement_hidden"`);
  try {
    await buildHarness().dispatcher.dispatchPending();
  } finally {
    await dataSource.query(`ALTER TABLE "user_achievement_hidden" RENAME TO "user_achievement"`);
  }

  assert.equal((await rows("engine_in_app_message")).length, 1);
  assert.equal(await outboxStatus(), "pending");

  await dataSource.query(`UPDATE "content_engine_events" SET "availableAt" = now()`);
  await dataSource.query(
    `UPDATE "engine_firing_ledger" SET "reservedAt" = now() - interval '1 hour'`,
  );

  await buildHarness().dispatcher.dispatchPending();

  // The message rule already fired: the ledger refuses it, so no duplicate.
  assert.equal(
    (await rows("engine_in_app_message")).length,
    1,
    "a successful rule must not run again on the retry",
  );
  assert.equal((await rows("user_achievement")).length, 1);
  assert.equal(await outboxStatus(), "delivered");
});
