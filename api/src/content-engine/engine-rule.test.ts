import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import { parseRuntimeEngineRule } from "./engine-rule";

function validRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    sourceDocumentId: "rule-1",
    key: "welcome-badge",
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

test("parses an evaluator-shaped mirror row", () => {
  const result = parseRuntimeEngineRule(validRuleRow());

  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.equal(result.rule.id, "rule-1");
  assert.equal(result.rule.key, "welcome-badge");
  assert.equal(result.rule.triggerEvent, eventNameTokens.taskCompleted);
  assert.equal(result.rule.effectType, effectTypeTokens.awardBadge);
  assert.equal(result.rule.dedupeScope, dedupeScopeTokens.oncePerUser);
  assert.deepEqual(result.rule.effectParams, { badgeKey: "first-video" });
  assert.equal(result.rule.conditions.length, 1);
});

test("a rule with zero conditions parses", () => {
  const result = parseRuntimeEngineRule(validRuleRow({ conditions: [] }));

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.rule.conditions, []);
});

test("keeps effect parameters opaque rather than interpreting them", () => {
  const effectParams = { nested: { anything: [1, 2, 3] }, count: 4 };
  const result = parseRuntimeEngineRule(validRuleRow({ effectParams }));

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.rule.effectParams, effectParams);
});

const invalidTopLevelTokens = [
  ["triggerEvent", "not.an.event"],
  ["effectType", "detonate"],
  ["dedupeScope", "once_per_century"],
] as const;

for (const [field, badValue] of invalidTopLevelTokens) {
  test(`reports an unknown ${field} instead of throwing`, () => {
    const result = parseRuntimeEngineRule(
      validRuleRow({ [field]: badValue }),
    );

    assert.equal(result.valid, false);
    if (result.valid) return;
    assert.equal(result.ruleId, "rule-1");
    assert.match(result.reason, new RegExp(badValue));
  });
}

test("reports a missing sourceDocumentId with a placeholder rule id", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({ sourceDocumentId: "  " }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.ruleId, "unknown");
  assert.match(result.reason, /sourceDocumentId/);
});

test("reports a missing key", () => {
  const result = parseRuntimeEngineRule(validRuleRow({ key: "" }));

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /key/);
});

test("reports non-array conditions", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({ conditions: { source: conditionSourceTokens.event } }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /conditions is not a list/);
});

test("reports a condition that is not an object", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({ conditions: ["contentType eq video"] }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /condition 1/);
});

test("reports a condition reading a field the trigger event does not have", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "streakLength",
          operator: operatorTokens.gte,
          value: 5,
        },
      ],
    }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /condition 1/);
  assert.match(result.reason, /streakLength/);
});

test("reports a condition whose operator does not suit the field type", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "contentType",
          operator: operatorTokens.gte,
          value: 3,
        },
      ],
    }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /condition 1/);
});

test("reports the index of the offending condition", () => {
  const result = parseRuntimeEngineRule(
    validRuleRow({
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "contentType",
          operator: operatorTokens.eq,
          value: "video",
        },
        {
          source: conditionSourceTokens.user,
          field: "not_an_attribute",
          operator: operatorTokens.eq,
          value: "x",
        },
      ],
    }),
  );

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.reason, /condition 2/);
});

test("reports non-object effectParams", () => {
  for (const effectParams of [null, "badge", 7, ["a"]]) {
    const result = parseRuntimeEngineRule(validRuleRow({ effectParams }));

    assert.equal(result.valid, false);
    if (result.valid) continue;
    assert.match(result.reason, /effectParams/);
  }
});

test("never throws on arbitrary input", () => {
  for (const row of [null, undefined, 7, "rule", [], new Date()]) {
    assert.doesNotThrow(() => parseRuntimeEngineRule(row));
    assert.equal(parseRuntimeEngineRule(row).valid, false);
  }
});

test('priority is preserved, defaults legacy rules, and rejects malformed values', () => {
  for (const priority of [0, 7, 2147483647]) {
    const result = parseRuntimeEngineRule(validRuleRow({ priority }));
    assert.ok(result.valid);
    if (result.valid) assert.equal(result.rule.priority, priority);
  }
  const legacy = parseRuntimeEngineRule(validRuleRow());
  if (legacy.valid) assert.equal(legacy.rule.priority, 100);
  for (const priority of [-1, 0.5, '7', null, 2147483648]) {
    assert.equal(parseRuntimeEngineRule(validRuleRow({ priority })).valid, false);
  }
});
