import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type {
  PostHogCapture,
  PostHogClientProvider,
} from "../observability/posthog-client.provider";
import {
  PostHogRuleEvaluationObserver,
  ruleEvaluationEventNames,
} from "./posthog-rule-evaluation.observer";
import {
  ruleEvaluationStages,
  type RuleEvaluationObservation,
} from "./rule-evaluation-observer.port";

interface Captured {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}

// The observer reads the shared client off the provider, so a provider-shaped
// object holding a fake client is the whole seam — no DI container needed.
function providerFor(client: PostHogCapture | null): PostHogClientProvider {
  return { client } as PostHogClientProvider;
}

function fakeClient(onCapture?: () => void) {
  const captures: Captured[] = [];

  const client: PostHogCapture = {
    capture(input) {
      onCapture?.();
      captures.push(input);
    },
    captureException() {},
    async shutdown() {},
  };

  return { client, captures };
}

function summary(
  overrides: Partial<RuleEvaluationObservation> = {},
): RuleEvaluationObservation {
  return {
    eventId: "event-1",
    eventName: eventNameTokens.taskCompleted,
    userId: "user-1",
    consideredRuleIds: ["rule-1", "rule-2", "rule-3"],
    qualifiedRuleIds: ["rule-1", "rule-2"],
    firedRuleIds: ["rule-1"],
    skipped: [{ ruleId: "rule-2", reason: "already_fired" }],
    failed: [{ ruleId: "rule-3", stage: "effect", error: "boom" }],
    ...overrides,
  };
}

test("records an evaluation against the acting user", async () => {
  const { client, captures } = fakeClient();

  await new PostHogRuleEvaluationObserver(providerFor(client)).record(summary());

  assert.equal(captures.length, 1);
  assert.equal(captures[0].event, ruleEvaluationEventNames.evaluation);
  assert.equal(captures[0].distinctId, "user-1");
});

test("records considered, qualified and fired rule ids with counts", async () => {
  const { client, captures } = fakeClient();

  await new PostHogRuleEvaluationObserver(providerFor(client)).record(summary());
  const properties = captures[0].properties ?? {};

  assert.deepEqual(properties.consideredRuleIds, ["rule-1", "rule-2", "rule-3"]);
  assert.deepEqual(properties.qualifiedRuleIds, ["rule-1", "rule-2"]);
  assert.deepEqual(properties.firedRuleIds, ["rule-1"]);
  assert.equal(properties.consideredCount, 3);
  assert.equal(properties.qualifiedCount, 2);
  assert.equal(properties.firedCount, 1);
  assert.equal(properties.eventId, "event-1");
  assert.equal(properties.eventName, eventNameTokens.taskCompleted);
});

test("records skipped and failed rules with their reasons", async () => {
  const { client, captures } = fakeClient();

  await new PostHogRuleEvaluationObserver(providerFor(client)).record(summary());
  const properties = captures[0].properties ?? {};

  assert.deepEqual(properties.skipped, [
    { ruleId: "rule-2", reason: "already_fired" },
  ]);
  assert.deepEqual(properties.failed, [
    { ruleId: "rule-3", stage: "effect", error: "boom" },
  ]);
});

test("records a per-rule error with its stage", async () => {
  const { client, captures } = fakeClient();

  await new PostHogRuleEvaluationObserver(providerFor(client)).recordRuleError({
    eventId: "event-1",
    eventName: eventNameTokens.streakReached,
    userId: "user-1",
    ruleId: "rule-9",
    stage: ruleEvaluationStages.reserve,
    error: "ledger unavailable",
  });

  assert.equal(captures[0].event, ruleEvaluationEventNames.ruleError);
  assert.equal(captures[0].distinctId, "user-1");
  assert.equal(captures[0].properties?.ruleId, "rule-9");
  assert.equal(
    captures[0].properties?.stage,
    ruleEvaluationStages.reserve,
  );
  assert.equal(captures[0].properties?.error, "ledger unavailable");
});

test("captures no authored rule bodies, condition values or event payloads", async () => {
  const { client, captures } = fakeClient();

  await new PostHogRuleEvaluationObserver(providerFor(client)).record(summary());
  const serialised = JSON.stringify(captures[0].properties);

  for (const leaked of [
    "payload",
    "effectParams",
    "conditions",
    "badgeKey",
  ]) {
    assert.ok(
      !serialised.includes(leaked),
      `${leaked} must not reach the analytics pipeline`,
    );
  }
});

test("an absent client captures nothing and does not throw", async () => {
  const observer = new PostHogRuleEvaluationObserver(providerFor(null));

  await observer.record(summary());
  await observer.recordRuleError({
    eventId: "event-1",
    eventName: eventNameTokens.taskCompleted,
    userId: "user-1",
    ruleId: "rule-1",
    stage: ruleEvaluationStages.parse,
    error: "unparseable",
  });
});

test("a throwing client is swallowed rather than propagated", async () => {
  const { client } = fakeClient(() => {
    throw new Error("posthog unreachable");
  });
  const observer = new PostHogRuleEvaluationObserver(providerFor(client));

  await assert.doesNotReject(() => observer.record(summary()));
  await assert.doesNotReject(() =>
    observer.recordRuleError({
      eventId: "event-1",
      eventName: eventNameTokens.taskCompleted,
      userId: "user-1",
      ruleId: "rule-1",
      stage: ruleEvaluationStages.effect,
      error: "boom",
    }),
  );
});
