import assert from "node:assert/strict";
import test from "node:test";

import {
  conditionSources,
  conditionSourceTokens,
  contentEngineCatalogue,
  dedupeScopes,
  dedupeScopeTokens,
  effectTypes,
  effectTypeTokens,
  eventNames,
  eventNameTokens,
  eventPayloadSchemas,
  followerMilestoneTiers,
  levelNames,
  levelNameTokens,
  operators,
  operatorTokens,
  userAttributeNames,
} from "./catalogue";

test("exports the exact closed v1 tokens", () => {
  assert.deepEqual(eventNames, [
    "task.completed",
    "task.skipped",
    "programme.started",
    "programme.completed",
    "programme.count_reached",
    "streak.reached",
    "streak.broken",
    "streak.resumed",
    "week.completed",
    "level.changed",
    "platform.connected",
    "follower.milestone",
    "subscription.started",
    "subscription.changed",
    "subscription.ended",
  ]);
  assert.deepEqual(operators, ["eq", "neq", "in", "gte", "lte"]);
  assert.deepEqual(effectTypes, [
    "suggest_programme",
    "unlock_programme",
    "prompt_call",
    "award_badge",
    "in-app-message",
    "grant_call",
  ]);
  assert.deepEqual(dedupeScopes, [
    "once_per_user",
    "once_per_user_per_programme",
    "every_time",
  ]);
  // The named handles consumers use in place of literals must stay in step with
  // the tuple: every scope reachable by name, and no name for a scope that does
  // not exist.
  assert.deepEqual(
    [...Object.values(dedupeScopeTokens)].sort(),
    [...dedupeScopes].sort(),
  );
  assert.deepEqual(userAttributeNames, [
    "subscription_status",
    "subscription_tier",
    "user_type",
    "experience_level",
    "is_founding_creator",
    "lifetime_task_completions",
    "programmes_completed",
  ]);
});

test("names every token consumers are forbidden to write as a literal", () => {
  // Consumer code (and consumer tests) cannot restate these tokens, so each
  // tuple needs a complete set of importable handles. Comparing sorted values
  // catches both a missing name and a name for a token that no longer exists.
  const namesMatchTuple = (
    tokens: Record<string, string>,
    tuple: readonly string[],
  ) =>
    assert.deepEqual([...Object.values(tokens)].sort(), [...tuple].sort());

  namesMatchTuple(eventNameTokens, eventNames);
  namesMatchTuple(operatorTokens, operators);
  namesMatchTuple(effectTypeTokens, effectTypes);
  namesMatchTuple(dedupeScopeTokens, dedupeScopes);
  namesMatchTuple(conditionSourceTokens, conditionSources);
  namesMatchTuple(levelNameTokens, levelNames);
});

test("follower.milestone accepts every declared tier and rejects a non-tier", () => {
  const schema = eventPayloadSchemas["follower.milestone"];

  for (const tier of followerMilestoneTiers) {
    assert.equal(
      schema.safeParse({ userId: "user-1", tier, followerCount: tier }).success,
      true,
      `tier ${tier} must parse`,
    );
  }

  assert.equal(
    schema.safeParse({ userId: "user-1", tier: 500, followerCount: 500 })
      .success,
    false,
    "a non-tier value must be rejected",
  );
});

// The api emits these with the enrolment's pinned version whenever it has
// one; a strict schema without the field rejected every versioned journey.
test("journey payloads accept an optional programme version", () => {
  const completed = { userId: "user-1", programmeId: "first-take" };
  const task = { ...completed, taskId: "task-1", contentType: "video" };

  for (const [schema, payload] of [
    [eventPayloadSchemas["task.completed"], task],
    [eventPayloadSchemas["programme.completed"], completed],
  ] as const) {
    assert.equal(schema.safeParse(payload).success, true);
    assert.equal(
      schema.safeParse({ ...payload, programmeVersionId: "first-take-v1" })
        .success,
      true,
    );
    assert.equal(
      schema.safeParse({ ...payload, programmeVersionId: "" }).success,
      false,
    );
  }
});

test("marks only grant_call as author-time rejected", () => {
  const rejected = Object.entries(contentEngineCatalogue.effects)
    .filter(([, definition]) => !definition.authorTimeAllowed)
    .map(([name]) => name);

  assert.deepEqual(rejected, ["grant_call"]);
});

test("defines a strict payload schema for every event", () => {
  const validPayloads = {
    "task.completed": {
      userId: "user-1",
      programmeId: "programme-1",
      taskId: "task-1",
      contentType: "video",
    },
    "task.skipped": {
      userId: "user-1",
      programmeId: "programme-1",
      taskId: "task-1",
      consecutiveSkipCount: 2,
    },
    "programme.started": { userId: "user-1", programmeId: "programme-1" },
    "programme.completed": { userId: "user-1", programmeId: "programme-1" },
    "programme.count_reached": { userId: "user-1", count: 3 },
    "streak.reached": { userId: "user-1", streakLength: 7 },
    "streak.broken": { userId: "user-1", priorLength: 6 },
    "streak.resumed": { userId: "user-1" },
    "week.completed": {
      userId: "user-1",
      programmeId: "programme-1",
      weekIndex: 2,
    },
    "level.changed": {
      userId: "user-1",
      newLevel: "Gold",
      previousLevel: "Silver",
    },
    "platform.connected": { userId: "user-1", platform: "instagram" },
    "follower.milestone": {
      userId: "user-1",
      tier: 1000,
      followerCount: 1042,
    },
    "subscription.started": {
      userId: "user-1",
      tier: "creator",
      foundingCreator: true,
    },
    "subscription.changed": {
      userId: "user-1",
      tier: "pro",
      previousTier: "creator",
    },
    "subscription.ended": { userId: "user-1", previousTier: "creator" },
  } as const;

  for (const eventName of eventNames) {
    const schema = eventPayloadSchemas[eventName];
    assert.equal(schema.safeParse(validPayloads[eventName]).success, true, eventName);
    assert.equal(
      schema.safeParse({ ...validPayloads[eventName], invented: true }).success,
      false,
      `${eventName} must reject unknown fields`,
    );
  }
});

test("catalogue exposes readable field types for every event", () => {
  assert.deepEqual(contentEngineCatalogue.events["task.skipped"].fields, {
    userId: { type: "string" },
    programmeId: { type: "string" },
    taskId: { type: "string" },
    consecutiveSkipCount: { type: "number" },
  });
  assert.equal(
    contentEngineCatalogue.events["follower.milestone"].fields.followerCount.type,
    "number",
  );
  assert.equal(
    contentEngineCatalogue.events["level.changed"].fields.newLevel.type,
    "string",
  );
});
