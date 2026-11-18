import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
  type AppPostgresUserAttributeReader,
  type AuthoredCondition,
  type UserAttributeName,
  type UserAttributeValueByName,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import type { RuntimeEngineRule } from "./engine-rule";
import { qualifiesRule } from "./rule-condition-evaluator";

function rule(conditions: AuthoredCondition[]): RuntimeEngineRule {
  return {
    id: "rule-1",
    key: "first-video",
    triggerEvent: eventNameTokens.taskCompleted,
    conditions,
    effectType: effectTypeTokens.awardBadge,
    effectParams: {},
    dedupeScope: dedupeScopeTokens.oncePerUser,
  };
}

function taskCompleted(
  payload: Partial<Record<string, unknown>> = {},
): ContentEvent {
  return {
    id: "event-1",
    eventName: eventNameTokens.taskCompleted,
    userId: "user-1",
    payload: {
      userId: "user-1",
      programmeId: "programme-1",
      taskId: "task-1",
      contentType: "video",
      ...payload,
    },
  } as ContentEvent;
}

function fakeReader(
  values: Partial<UserAttributeValueByName> = {},
): AppPostgresUserAttributeReader & { reads: string[] } {
  const reads: string[] = [];

  return {
    reads,
    async read<Name extends UserAttributeName>(
      _userId: string,
      attribute: Name,
    ): Promise<UserAttributeValueByName[Name]> {
      reads.push(attribute);
      return (values[attribute] ??
        null) as UserAttributeValueByName[Name];
    },
  };
}

const eventCondition = (
  overrides: Partial<AuthoredCondition> = {},
): AuthoredCondition => ({
  source: conditionSourceTokens.event,
  field: "contentType",
  operator: operatorTokens.eq,
  value: "video",
  ...overrides,
});

const userCondition = (
  overrides: Partial<AuthoredCondition> = {},
): AuthoredCondition => ({
  source: conditionSourceTokens.user,
  field: "user_type",
  operator: operatorTokens.eq,
  value: "creator",
  ...overrides,
});

test("a rule with no conditions qualifies", async () => {
  const result = await qualifiesRule(rule([]), taskCompleted(), fakeReader());

  assert.deepEqual(result, { qualifies: true });
});

test("all matching conditions qualify", async () => {
  const result = await qualifiesRule(
    rule([
      eventCondition(),
      eventCondition({ field: "programmeId", value: "programme-1" }),
      userCondition(),
    ]),
    taskCompleted(),
    fakeReader({ user_type: "creator" }),
  );

  assert.deepEqual(result, { qualifies: true });
});

test("the first non-matching condition reports condition_not_met with its index", async () => {
  const result = await qualifiesRule(
    rule([
      eventCondition(),
      eventCondition({ field: "programmeId", value: "programme-9" }),
    ]),
    taskCompleted(),
    fakeReader(),
  );

  assert.deepEqual(result, {
    qualifies: false,
    reason: "condition_not_met",
    conditionIndex: 1,
  });
});

test("conditions are ANDed, not ORed", async () => {
  const result = await qualifiesRule(
    rule([
      eventCondition({ value: "video" }),
      eventCondition({ field: "taskId", value: "some-other-task" }),
    ]),
    taskCompleted(),
    fakeReader(),
  );

  assert.equal(result.qualifies, false);
});

test("conditions after a failure are not read", async () => {
  const reader = fakeReader({ user_type: "creator" });

  await qualifiesRule(
    rule([eventCondition({ value: "carousel" }), userCondition()]),
    taskCompleted(),
    reader,
  );

  assert.deepEqual(
    reader.reads,
    [],
    "a user attribute must not be fetched once the rule is already ruled out",
  );
});

test("user conditions resolve through the attribute reader", async () => {
  const reader = fakeReader({ user_type: "creator" });

  const result = await qualifiesRule(
    rule([userCondition()]),
    taskCompleted(),
    reader,
  );

  assert.deepEqual(result, { qualifies: true });
  assert.deepEqual(reader.reads, ["user_type"]);
});

test("numeric user conditions compare as numbers", async () => {
  const result = await qualifiesRule(
    rule([
      userCondition({
        field: "lifetime_task_completions",
        operator: operatorTokens.gte,
        value: 10,
      }),
    ]),
    taskCompleted(),
    fakeReader({ lifetime_task_completions: 12 }),
  );

  assert.deepEqual(result, { qualifies: true });
});

test("a null user attribute does not match", async () => {
  const result = await qualifiesRule(
    rule([userCondition({ field: "subscription_status", value: "active" })]),
    taskCompleted(),
    fakeReader({ subscription_status: null }),
  );

  assert.deepEqual(result, {
    qualifies: false,
    reason: "condition_not_met",
    conditionIndex: 0,
  });
});

test("a missing payload field does not match", async () => {
  const event = taskCompleted();
  delete (event.payload as Record<string, unknown>).contentType;

  const result = await qualifiesRule(rule([eventCondition()]), event, fakeReader());

  assert.deepEqual(result, {
    qualifies: false,
    reason: "condition_not_met",
    conditionIndex: 0,
  });
});

test("a field the event does not define is an invalid condition", async () => {
  const result = await qualifiesRule(
    rule([eventCondition({ field: "streakLength" })]),
    taskCompleted(),
    fakeReader(),
  );

  assert.equal(result.qualifies, false);
  if (result.qualifies) return;
  assert.equal(result.reason, "invalid_condition");
  assert.equal(result.conditionIndex, 0);
  assert.match(String(result.detail), /streakLength/);
});

test("an actual value of the wrong runtime type is an invalid condition", async () => {
  const result = await qualifiesRule(
    rule([eventCondition()]),
    taskCompleted({ contentType: 7 }),
    fakeReader(),
  );

  assert.equal(result.qualifies, false);
  if (result.qualifies) return;
  assert.equal(result.reason, "invalid_condition");
  assert.equal(result.conditionIndex, 0);
});

test("an unknown condition source is an invalid condition", async () => {
  const result = await qualifiesRule(
    rule([eventCondition({ source: "elsewhere" })]),
    taskCompleted(),
    fakeReader(),
  );

  assert.equal(result.qualifies, false);
  if (result.qualifies) return;
  assert.equal(result.reason, "invalid_condition");
});

test("event fields come from the payload, never from the envelope", async () => {
  // The envelope carries id/eventName/userId. Only payload fields are
  // addressable, so an envelope-only name must not resolve.
  const result = await qualifiesRule(
    rule([eventCondition({ field: "id", value: "event-1" })]),
    taskCompleted(),
    fakeReader(),
  );

  assert.equal(result.qualifies, false);
  if (result.qualifies) return;
  assert.equal(result.reason, "invalid_condition");
});

test("an event field is never satisfied by a same-named user attribute", async () => {
  const reader = fakeReader({ user_type: "creator" });

  const result = await qualifiesRule(
    rule([eventCondition({ field: "user_type", value: "creator" })]),
    taskCompleted(),
    reader,
  );

  assert.equal(result.qualifies, false);
  if (result.qualifies) return;
  assert.equal(result.reason, "invalid_condition");
  assert.deepEqual(reader.reads, []);
});

test("an in operator matches any listed value", async () => {
  const result = await qualifiesRule(
    rule([
      eventCondition({
        operator: operatorTokens.in,
        value: ["reel", "video"],
      }),
    ]),
    taskCompleted(),
    fakeReader(),
  );

  assert.deepEqual(result, { qualifies: true });
});
