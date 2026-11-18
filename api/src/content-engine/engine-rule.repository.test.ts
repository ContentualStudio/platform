import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import { EngineRuleRepository } from "./engine-rule.repository";

interface RecordedQuery {
  sql: string;
  parameters: unknown[];
}

function fakeManager(rows: unknown) {
  const queries: RecordedQuery[] = [];

  const manager = {
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      return rows;
    },
  } as unknown as EntityManager;

  return { manager, queries };
}

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    sourceDocumentId: "rule-1",
    key: "first-video",
    triggerEvent: eventNameTokens.taskCompleted,
    conditions: [
      {
        source: conditionSourceTokens.event,
        field: "contentType",
        operator: operatorTokens.eq,
        value: "video",
      },
    ],
    effectType: effectTypeTokens.awardBadge,
    effectParams: { badgeKey: "first-video" },
    dedupeScope: dedupeScopeTokens.oncePerUser,
    ...overrides,
  };
}

function normalise(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

test("selects active rules for the emitted event, ordered by source id", async () => {
  const { manager, queries } = fakeManager([ruleRow()]);

  await new EngineRuleRepository(manager).findActiveByTrigger(
    eventNameTokens.taskCompleted,
  );

  assert.equal(queries.length, 1);
  assert.equal(
    normalise(queries[0].sql),
    normalise(`
      SELECT "sourceDocumentId", "key", "triggerEvent", "conditions",
             "effectType", "effectParams", "dedupeScope", "priority"
      FROM "engine_rules"
      WHERE "active" = true AND "triggerEvent" = $1
      ORDER BY "sourceDocumentId" ASC
    `),
  );
});

test("binds the emitted event name as $1 rather than interpolating it", async () => {
  const { manager, queries } = fakeManager([]);

  await new EngineRuleRepository(manager).findActiveByTrigger(
    eventNameTokens.streakReached,
  );

  assert.deepEqual(queries[0].parameters, [eventNameTokens.streakReached]);
  assert.ok(!queries[0].sql.includes(eventNameTokens.streakReached));
});

test("uses no SQL verb other than SELECT against the mirror", async () => {
  const { manager, queries } = fakeManager([]);

  await new EngineRuleRepository(manager).findActiveByTrigger(
    eventNameTokens.taskCompleted,
  );

  const sql = queries[0].sql.toUpperCase();

  for (const verb of [
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "ALTER",
    "DROP",
    "CREATE",
    "GRANT",
  ]) {
    assert.ok(!sql.includes(verb), `${verb} must not appear`);
  }

  assert.ok(sql.includes("SELECT"));
});

test("returns valid and invalid rows separately", async () => {
  const { manager } = fakeManager([
    ruleRow({ sourceDocumentId: "rule-1" }),
    ruleRow({ sourceDocumentId: "rule-2", effectType: "detonate" }),
    ruleRow({ sourceDocumentId: "rule-3" }),
  ]);

  const selected = await new EngineRuleRepository(
    manager,
  ).findActiveByTrigger(eventNameTokens.taskCompleted);

  assert.deepEqual(
    selected.valid.map((rule) => rule.id),
    ["rule-1", "rule-3"],
  );
  assert.equal(selected.invalid.length, 1);
  assert.equal(selected.invalid[0].ruleId, "rule-2");
});

test("preserves the database ordering of valid rules", async () => {
  const { manager } = fakeManager([
    ruleRow({ sourceDocumentId: "rule-a" }),
    ruleRow({ sourceDocumentId: "rule-b" }),
    ruleRow({ sourceDocumentId: "rule-c" }),
  ]);

  const selected = await new EngineRuleRepository(
    manager,
  ).findActiveByTrigger(eventNameTokens.taskCompleted);

  assert.deepEqual(
    selected.valid.map((rule) => rule.id),
    ["rule-a", "rule-b", "rule-c"],
  );
});

test("returns empty collections when no rule listens for the event", async () => {
  const { manager } = fakeManager([]);

  const selected = await new EngineRuleRepository(
    manager,
  ).findActiveByTrigger(eventNameTokens.streakBroken);

  assert.deepEqual(selected.valid, []);
  assert.deepEqual(selected.invalid, []);
});

test("normalises the driver's empty [rows, count] result shape", async () => {
  const { manager } = fakeManager([[], 0]);

  const selected = await new EngineRuleRepository(
    manager,
  ).findActiveByTrigger(eventNameTokens.taskCompleted);

  assert.deepEqual(selected.valid, []);
  assert.deepEqual(selected.invalid, []);
});
