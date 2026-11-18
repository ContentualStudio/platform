import * as assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../../database/testing/test-data-source";
import { AdminEngineActivityService } from "./admin-engine-activity.service";

// Real ledger, queue and mirror tables. The shared test database may hold
// other suites' rows, so assertions read only this suite's rules and users.
const TOKEN = "zzengineactivity";
const USER = `${TOKEN}-user`;
const FIRED_RULE = `${TOKEN}-rule-fired`;
const QUIET_RULE = `${TOKEN}-rule-quiet`;
const GONE_RULE = `${TOKEN}-rule-gone`;
const BADGE = `${TOKEN}-badge`;
const GONE_BADGE = `${TOKEN}-badge-gone`;
const EVENT = `${TOKEN}-event`;
const now = new Date("2026-10-14T12:00:00.000Z");

let dataSource: DataSource;
let service: AdminEngineActivityService;

async function seedRule(id: string, name: string, triggerEvent: string) {
  await dataSource.query(
    `INSERT INTO "engine_rules"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name",
        "triggerEvent", "conditions", "effectType", "effectParams", "dedupeScope", "active")
     VALUES ($1, now(), now(), $1, $2, $3, '[]'::jsonb, 'award_badge', '{}'::jsonb, 'once_per_user', true)`,
    [id, name, triggerEvent],
  );
}

async function ledger(
  ruleId: string,
  eventRef: string,
  firedAt: string | null,
  scopeKey = `event:${randomUUID()}`,
) {
  await dataSource.query(
    `INSERT INTO "engine_firing_ledger"
       ("ruleId", "userId", "scopeKey", "dedupeScope", "eventRef", "status",
        "leaseToken", "reservedAt", "firedAt")
     VALUES ($1, $2, $3, 'per_event', $4, $5, $6, COALESCE($7::timestamptz, now()), $7::timestamptz)`,
    [ruleId, USER, scopeKey, eventRef, firedAt ? "fired" : "reserved", randomUUID(), firedAt],
  );
}

async function clear() {
  await dataSource.query(`DELETE FROM "engine_firing_ledger" WHERE "userId" = $1`, [USER]);
  await dataSource.query(`DELETE FROM "badge_cooldown_queue" WHERE "userId" = $1`, [USER]);
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "id" = $1`, [EVENT]);
  await dataSource.query(`DELETE FROM "engine_rules" WHERE "sourceDocumentId" LIKE $1`, [`${TOKEN}%`]);
  await dataSource.query(`DELETE FROM "engine_badges" WHERE "sourceDocumentId" LIKE $1`, [`${TOKEN}%`]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER]);
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  service = new AdminEngineActivityService(dataSource);
  await clear();

  await dataSource.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, 'Ada', $2)`, [
    USER,
    `${USER}@example.test`,
  ]);
  await seedRule(FIRED_RULE, "First task badge", "task.completed");
  await seedRule(QUIET_RULE, "Streak nudge", "streak.reached");
  await dataSource.query(
    `INSERT INTO "engine_badges"
       ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", "key", "name", "description", "active")
     VALUES ($1, now(), now(), $1, 'First steps', 'Earned it', true)`,
    [BADGE],
  );
  await dataSource.query(
    `INSERT INTO "content_engine_events" ("id", "eventName", "userId", "payload")
     VALUES ($1, 'programme.started', $2, '{}'::jsonb)`,
    [EVENT, USER],
  );

  // Fired from a real event: its name comes from the event, not the rule.
  await ledger(FIRED_RULE, EVENT, "2026-10-14T08:00:00.000Z");
  // Backfilled (no event row): falls back to the rule's trigger.
  await ledger(FIRED_RULE, `${TOKEN}-backfill`, "2026-10-12T08:00:00.000Z");
  // Still reserved: not a firing yet.
  await ledger(FIRED_RULE, EVENT, null);
  // A rule the mirror no longer has.
  await ledger(GONE_RULE, EVENT, "2026-10-10T08:00:00.000Z");

  await dataSource.query(
    `INSERT INTO "badge_cooldown_queue"
       ("userId", "badgeId", "ruleId", "eventId", "status", "enqueuedAt", "releasedAt")
     VALUES ($1, $2, $4, $5, 'released', '2026-10-12T08:00:00Z', '2026-10-13T08:00:00Z'),
            ($1, $3, $4, $5, 'queued', '2026-10-14T08:00:00Z', NULL)`,
    [USER, BADGE, GONE_BADGE, FIRED_RULE, EVENT],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await clear();
  await dataSource.destroy();
});

test("the firing log lists fired rows newest first, with event names and missing rules by id", { skip }, async () => {
  const fired = await service.firings({ ruleId: FIRED_RULE, eventName: null });

  assert.deepEqual(
    fired.firings.map((row) => [row.eventName, row.firedAt]),
    [
      ["programme.started", "2026-10-14T08:00:00.000Z"],
      ["task.completed", "2026-10-12T08:00:00.000Z"],
    ],
  );
  assert.equal(fired.firings[0]!.ruleName, "First task badge");
  assert.equal(fired.firings[0]!.userEmail, `${USER}@example.test`);

  const gone = await service.firings({ ruleId: GONE_RULE, eventName: null });
  assert.equal(gone.firings.length, 1);
  assert.equal(gone.firings[0]!.ruleName, null);
});

test("the event filter matches the resolved event name", { skip }, async () => {
  const log = await service.firings({ ruleId: FIRED_RULE, eventName: "task.completed" });

  assert.deepEqual(
    log.firings.map((row) => row.firedAt),
    ["2026-10-12T08:00:00.000Z"],
  );
  assert.equal(log.filters.eventName, "task.completed");
});

test("the rule picker offers authored rules and ledger-only rules", { skip }, async () => {
  const { options } = await service.firings({ ruleId: null, eventName: null });
  const ours = options.rules.filter((rule) => rule.id.startsWith(TOKEN));

  assert.deepEqual(ours, [
    { id: FIRED_RULE, name: "First task badge" },
    { id: QUIET_RULE, name: "Streak nudge" },
    { id: GONE_RULE, name: null },
  ]);
  assert.ok(options.events.includes("task.completed"));
});

test("the rule summary counts firings, shows never-fired rules and keeps vanished ones", { skip }, async () => {
  const { rules, daily } = await service.rules(now);
  const ours = rules.filter((rule) => rule.ruleId.startsWith(TOKEN));

  assert.deepEqual(
    ours.map((rule) => [rule.ruleId, rule.name, rule.firings, rule.lastFiredAt]),
    [
      [FIRED_RULE, "First task badge", 2, "2026-10-14T08:00:00.000Z"],
      [QUIET_RULE, "Streak nudge", 0, null],
      [GONE_RULE, null, 1, "2026-10-10T08:00:00.000Z"],
    ],
  );

  assert.equal(daily.length, 30);
  assert.ok(daily.find((point) => point.day === "2026-10-14")!.firings >= 1);
  assert.ok(daily.find((point) => point.day === "2026-10-12")!.firings >= 1);
});

test("the cooldown log shows status, release time and badges by stored id when missing", { skip }, async () => {
  const { entries, counts } = await service.cooldown();
  const ours = entries.filter((entry) => entry.userId === USER);

  assert.deepEqual(
    ours.map((entry) => [entry.badgeId, entry.badgeName, entry.status, entry.releasedAt]),
    [
      [GONE_BADGE, null, "queued", null],
      [BADGE, "First steps", "released", "2026-10-13T08:00:00.000Z"],
    ],
  );
  assert.ok(counts.queued >= 1);
  assert.ok(counts.released >= 1);
  assert.equal(typeof counts.suppressed, "number");
});
