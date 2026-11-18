import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
  type AuthoredCondition,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import type { RuntimeEngineRule } from "./engine-rule";
import type {
  EngineRuleRepository,
  InvalidRule,
  SelectedRules,
} from "./engine-rule.repository";
import {
  PermanentEffectError,
  type ContentEngineEffectDispatcher,
  type EffectDispatchInput,
} from "./effect-dispatcher.port";
import type { FiringLedgerService, Reservation } from "./firing-ledger.service";
import type {
  RuleEvaluationObservation,
  RuleEvaluationObserver,
  RuleEvaluationRuleError,
} from "./rule-evaluation-observer.port";
import {
  RuleEvaluationIncompleteError,
  RuleEvaluatorService,
} from "./rule-evaluator.service";
import { RuleFiringService } from "./rule-firing.service";
import type { UserAttributeReaderFactory } from "./user-attribute.reader";

function rule(overrides: Partial<RuntimeEngineRule> = {}): RuntimeEngineRule {
  return {
    id: "rule-1",
    key: "first-video",
    triggerEvent: eventNameTokens.taskCompleted,
    conditions: [],
    effectType: effectTypeTokens.awardBadge,
    effectParams: { badgeKey: "first-video" },
    dedupeScope: dedupeScopeTokens.oncePerUser,
    ...overrides,
  };
}

function taskCompleted(payload: Record<string, unknown> = {}): ContentEvent {
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

const failingCondition: AuthoredCondition = {
  source: conditionSourceTokens.event,
  field: "contentType",
  operator: operatorTokens.eq,
  value: "carousel",
};

interface Harness {
  service: RuleEvaluatorService;
  calls: string[];
  reserved: unknown[];
  dispatched: EffectDispatchInput[];
  summaries: RuleEvaluationObservation[];
  ruleErrors: RuleEvaluationRuleError[];
  marked: string[];
}

function harness(options: {
  selected?: SelectedRules;
  selectError?: Error;
  reserve?: (ruleId: string) => Reservation | Promise<Reservation>;
  dispatch?: (input: EffectDispatchInput) => Promise<void>;
  observerThrows?: boolean;
  qualifyThrowsFor?: string;
}): Harness {
  const calls: string[] = [];
  const reserved: unknown[] = [];
  const dispatched: EffectDispatchInput[] = [];
  const summaries: RuleEvaluationObservation[] = [];
  const ruleErrors: RuleEvaluationRuleError[] = [];
  const marked: string[] = [];

  const rules = {
    async findActiveByTrigger() {
      calls.push("select");
      if (options.selectError) throw options.selectError;
      return options.selected ?? { valid: [], invalid: [] };
    },
  } as unknown as EngineRuleRepository;

  const ledger = {
    async reserve(context: { ruleId: string }) {
      calls.push(`reserve:${context.ruleId}`);
      reserved.push(context);
      return (
        (await options.reserve?.(context.ruleId)) ?? {
          fresh: true,
          ledgerId: `ledger-${context.ruleId}`,
          leaseToken: `lease-${context.ruleId}`,
          attempt: 1,
        }
      );
    },
    async markFired(_userId: string, ledgerId: string) {
      marked.push(ledgerId);
      return { marked: true as const };
    },
  } as unknown as FiringLedgerService;

  const effects: ContentEngineEffectDispatcher = {
    async dispatch(input) {
      calls.push(`dispatch:${input.rule.id}`);
      dispatched.push(input);

      if (options.dispatch) {
        await options.dispatch(input);
      }

      // A real handler completes its own reservation; the evaluator must never
      // do it. The fake models that so the ordering is observable.
      await ledger.markFired(
        input.event.userId,
        input.reservation.ledgerId,
        input.reservation.leaseToken,
      );
    },
  };

  const observer: RuleEvaluationObserver = {
    async record(summary) {
      calls.push("record");
      if (options.observerThrows) throw new Error("posthog down");
      summaries.push(summary);
    },
    async recordRuleError(input) {
      calls.push(`ruleError:${input.ruleId}:${input.stage}`);
      if (options.observerThrows) throw new Error("posthog down");
      ruleErrors.push(input);
    },
    async recordBackfill() {
      throw new Error("the evaluator never reports a backfill");
    },
  };

  const userAttributes = {
    forEvaluation() {
      calls.push("reader");
      return {
        async read(_userId: string, attribute: string) {
          calls.push(`attribute:${attribute}`);
          if (options.qualifyThrowsFor) {
            throw new Error(options.qualifyThrowsFor);
          }
          return null;
        },
      };
    },
  } as unknown as UserAttributeReaderFactory;

  return {
    service: new RuleEvaluatorService(
      rules,
      userAttributes,
      new RuleFiringService(ledger, effects),
      observer,
    ),
    calls,
    reserved,
    dispatched,
    summaries,
    ruleErrors,
    marked,
  };
}

test("zero selected rules records an empty evaluation and does no other work", async () => {
  const h = harness({ selected: { valid: [], invalid: [] } });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.reserved, []);
  assert.deepEqual(h.dispatched, []);
  assert.ok(!h.calls.some((call) => call.startsWith("attribute:")));
  assert.equal(h.summaries.length, 1);
  assert.deepEqual(h.summaries[0].consideredRuleIds, []);
  assert.deepEqual(h.summaries[0].firedRuleIds, []);
});

test("a condition-free rule reserves before it dispatches", async () => {
  const h = harness({ selected: { valid: [rule()], invalid: [] } });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.calls, [
    "select",
    "reader",
    "reserve:rule-1",
    "dispatch:rule-1",
    "record",
  ]);
});

test("a non-qualifying rule never reserves", async () => {
  const h = harness({
    selected: {
      valid: [rule({ conditions: [failingCondition] })],
      invalid: [],
    },
  });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.reserved, []);
  assert.deepEqual(h.dispatched, []);
  assert.deepEqual(h.summaries[0].qualifiedRuleIds, []);
  assert.equal(h.summaries[0].skipped[0].ruleId, "rule-1");
  assert.match(h.summaries[0].skipped[0].reason, /condition_not_met/);
});

test("programmeId comes from the event payload", async () => {
  const h = harness({
    selected: {
      valid: [rule({ dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme })],
      invalid: [],
    },
  });

  await h.service.evaluate(taskCompleted({ programmeId: "programme-7" }));

  assert.equal(
    (h.reserved[0] as { programmeId: string }).programmeId,
    "programme-7",
  );
});

test("programmeId is null when the payload has no such field", async () => {
  const h = harness({ selected: { valid: [rule()], invalid: [] } });

  await h.service.evaluate({
    id: "event-2",
    eventName: eventNameTokens.streakResumed,
    userId: "user-1",
    payload: { userId: "user-1" },
  } as ContentEvent);

  assert.equal((h.reserved[0] as { programmeId: unknown }).programmeId, null);
});

test("programmeId is null when the payload field is blank", async () => {
  const h = harness({ selected: { valid: [rule()], invalid: [] } });

  await h.service.evaluate(taskCompleted({ programmeId: "   " }));

  assert.equal((h.reserved[0] as { programmeId: unknown }).programmeId, null);
});

test("effect parameters never supply the programme id", async () => {
  const h = harness({
    selected: {
      valid: [
        rule({
          dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
          effectParams: { programmeId: "programme-from-effect" },
        }),
      ],
      invalid: [],
    },
  });

  await h.service.evaluate(taskCompleted({ programmeId: "programme-7" }));

  assert.equal(
    (h.reserved[0] as { programmeId: string }).programmeId,
    "programme-7",
  );
});

test("a reservation that is not fresh skips dispatch and records the reason", async () => {
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    reserve: () => ({ fresh: false, reason: "already_fired" }),
  });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.dispatched, []);
  assert.deepEqual(h.summaries[0].firedRuleIds, []);
  assert.deepEqual(h.summaries[0].skipped, [
    { ruleId: "rule-1", reason: "already_fired" },
  ]);
});

test("replaying an event does not redispatch an already-fired rule", async () => {
  const fired = new Set<string>();
  const options = {
    selected: { valid: [rule()], invalid: [] },
    reserve: (ruleId: string): Reservation =>
      fired.has(ruleId)
        ? { fresh: false, reason: "already_fired" as const }
        : {
            fresh: true as const,
            ledgerId: "ledger-1",
            leaseToken: "lease-1",
            attempt: 1,
          },
  };

  const first = harness(options);
  await first.service.evaluate(taskCompleted());
  fired.add("rule-1");

  const second = harness(options);
  await second.service.evaluate(taskCompleted());

  assert.equal(first.dispatched.length, 1);
  assert.equal(second.dispatched.length, 0);
});

test("several qualifying rules reserve and dispatch independently, in order", async () => {
  const h = harness({
    selected: {
      valid: [
        rule({ id: "rule-a" }),
        rule({ id: "rule-b" }),
        rule({ id: "rule-c" }),
      ],
      invalid: [],
    },
  });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.calls, [
    "select",
    "reader",
    "reserve:rule-a",
    "dispatch:rule-a",
    "reserve:rule-b",
    "dispatch:rule-b",
    "reserve:rule-c",
    "dispatch:rule-c",
    "record",
  ]);
  assert.deepEqual(h.summaries[0].firedRuleIds, [
    "rule-a",
    "rule-b",
    "rule-c",
  ]);
});

test("an invalid mirror row is reported and later valid rules still run", async () => {
  const invalid: InvalidRule = {
    valid: false,
    ruleId: "rule-bad",
    reason: "detonate is not a known effect type",
  };
  const h = harness({
    selected: { valid: [rule({ id: "rule-good" })], invalid: [invalid] },
  });

  await h.service.evaluate(taskCompleted());

  assert.deepEqual(h.summaries[0].firedRuleIds, ["rule-good"]);
  assert.deepEqual(h.summaries[0].failed, [
    {
      ruleId: "rule-bad",
      stage: "parse",
      error: "detonate is not a known effect type",
    },
  ]);
  assert.equal(h.ruleErrors[0].stage, "parse");
});

test("an effect failure isolates one rule and leaves the reservation unmarked", async () => {
  const h = harness({
    selected: {
      valid: [rule({ id: "rule-a" }), rule({ id: "rule-b" })],
      invalid: [],
    },
    dispatch: async (input) => {
      if (input.rule.id === "rule-a") throw new Error("effect exploded");
    },
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );

  assert.deepEqual(h.summaries[0].firedRuleIds, ["rule-b"]);
  assert.deepEqual(h.summaries[0].failed, [
    { ruleId: "rule-a", stage: "effect", error: "effect exploded" },
  ]);
  assert.deepEqual(
    h.marked,
    ["ledger-rule-b"],
    "the failed rule's reservation must stay unmarked for the ledger to arbitrate",
  );
});

test("a reserve failure isolates one rule", async () => {
  const h = harness({
    selected: {
      valid: [rule({ id: "rule-a" }), rule({ id: "rule-b" })],
      invalid: [],
    },
    reserve: (ruleId) => {
      if (ruleId === "rule-a") throw new Error("ledger unavailable");
      return {
        fresh: true,
        ledgerId: "ledger-rule-b",
        leaseToken: "lease-rule-b",
        attempt: 1,
      };
    },
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );

  assert.deepEqual(h.summaries[0].firedRuleIds, ["rule-b"]);
  assert.deepEqual(h.summaries[0].failed, [
    { ruleId: "rule-a", stage: "reserve", error: "ledger unavailable" },
  ]);
});

test("a condition failure isolates one rule", async () => {
  const userConditionRule = rule({
    id: "rule-a",
    conditions: [
      {
        source: conditionSourceTokens.user,
        field: "user_type",
        operator: operatorTokens.eq,
        value: "creator",
      },
    ],
  });
  const h = harness({
    selected: { valid: [userConditionRule, rule({ id: "rule-b" })], invalid: [] },
    qualifyThrowsFor: "attribute read failed",
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );

  assert.deepEqual(h.summaries[0].firedRuleIds, ["rule-b"]);
  assert.deepEqual(h.summaries[0].failed, [
    { ruleId: "rule-a", stage: "condition", error: "attribute read failed" },
  ]);
});

test("an observer failure does not fail the evaluation or the effects", async () => {
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    observerThrows: true,
  });

  await assert.doesNotReject(() => h.service.evaluate(taskCompleted()));
  assert.equal(h.dispatched.length, 1);
});

test("the summary names considered, qualified, fired, skipped and failed rules", async () => {
  const h = harness({
    selected: {
      valid: [
        rule({ id: "rule-fires" }),
        rule({ id: "rule-skips", conditions: [failingCondition] }),
        rule({ id: "rule-held" }),
        rule({ id: "rule-fails" }),
      ],
      invalid: [
        { valid: false, ruleId: "rule-unparseable", reason: "bad row" },
      ],
    },
    reserve: (ruleId) =>
      ruleId === "rule-held"
        ? { fresh: false, reason: "reservation_held" }
        : {
            fresh: true,
            ledgerId: `ledger-${ruleId}`,
            leaseToken: `lease-${ruleId}`,
            attempt: 1,
          },
    dispatch: async (input) => {
      if (input.rule.id === "rule-fails") throw new Error("nope");
    },
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );
  const summary = h.summaries[0];

  assert.deepEqual(summary.consideredRuleIds, [
    "rule-unparseable",
    "rule-fires",
    "rule-skips",
    "rule-held",
    "rule-fails",
  ]);
  assert.deepEqual(summary.qualifiedRuleIds, [
    "rule-fires",
    "rule-held",
    "rule-fails",
  ]);
  assert.deepEqual(summary.firedRuleIds, ["rule-fires"]);
  assert.deepEqual(
    summary.skipped.map((entry) => entry.ruleId),
    ["rule-skips", "rule-held"],
  );
  assert.deepEqual(
    summary.failed.map((entry) => `${entry.ruleId}:${entry.stage}`),
    ["rule-unparseable:parse", "rule-fails:effect"],
  );
  assert.equal(summary.eventId, "event-1");
  assert.equal(summary.userId, "user-1");
});

test("the evaluator never completes a reservation itself", async () => {
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    dispatch: async () => {},
  });

  await h.service.evaluate(taskCompleted());

  // Marked exactly once, by the dispatcher fake standing in for a handler.
  assert.deepEqual(h.marked, ["ledger-rule-1"]);
  assert.ok(h.calls.indexOf("dispatch:rule-1") < h.calls.indexOf("record"));
});

test("a failure to select rules rejects so the event stays pending", async () => {
  const h = harness({ selectError: new Error("mirror unreachable") });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    /mirror unreachable/,
  );
  assert.deepEqual(h.summaries, []);
});

test("the reservation handed to a handler is always fresh", async () => {
  const h = harness({ selected: { valid: [rule()], invalid: [] } });

  await h.service.evaluate(taskCompleted());

  assert.equal(h.dispatched[0].reservation.fresh, true);
  assert.equal(h.dispatched[0].reservation.ledgerId, "ledger-rule-1");
  assert.equal(h.dispatched[0].rule.id, "rule-1");
  assert.equal(h.dispatched[0].event.id, "event-1");
});

test("a permanent effect failure does not hold the event open", async () => {
  // A rule naming a badge that does not exist fails identically forever, so
  // retrying the event would never deliver it.
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    dispatch: async () => {
      throw new PermanentEffectError("award_badge requires badgeSourceId");
    },
  });

  await assert.doesNotReject(() => h.service.evaluate(taskCompleted()));
  assert.deepEqual(h.summaries[0].failed, [
    {
      ruleId: "rule-1",
      stage: "effect",
      error: "award_badge requires badgeSourceId",
    },
  ]);
});

test("a transient effect failure keeps the event retryable", async () => {
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    dispatch: async () => {
      throw new Error("connection terminated");
    },
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );
});

test("a held reservation keeps the event retryable", async () => {
  // Its effect has not run and nothing else will come back for it.
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    reserve: () => ({ fresh: false, reason: "reservation_held" }),
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    RuleEvaluationIncompleteError,
  );
});

test("an already-fired reservation lets the event complete", async () => {
  // The effect ran on a previous attempt; there is nothing left to retry.
  const h = harness({
    selected: { valid: [rule()], invalid: [] },
    reserve: () => ({ fresh: false, reason: "already_fired" }),
  });

  await assert.doesNotReject(() => h.service.evaluate(taskCompleted()));
});

test("an unparseable rule does not hold the event open", async () => {
  const h = harness({
    selected: {
      valid: [],
      invalid: [{ valid: false, ruleId: "rule-bad", reason: "bad row" }],
    },
  });

  await assert.doesNotReject(() => h.service.evaluate(taskCompleted()));
});

test("the retry names only the unfinished rules and reports the run first", async () => {
  const h = harness({
    selected: {
      valid: [rule({ id: "rule-ok" }), rule({ id: "rule-transient" })],
      invalid: [],
    },
    dispatch: async (input) => {
      if (input.rule.id === "rule-transient") throw new Error("db down");
    },
  });

  await assert.rejects(
    () => h.service.evaluate(taskCompleted()),
    (error: unknown) => {
      assert.ok(error instanceof RuleEvaluationIncompleteError);
      assert.deepEqual(error.ruleIds, ["rule-transient"]);
      assert.equal(error.eventId, "event-1");
      return true;
    },
  );

  // The successful rule kept its firing, and the run was still observed.
  assert.deepEqual(h.summaries[0].firedRuleIds, ["rule-ok"]);
  assert.deepEqual(h.marked, ["ledger-rule-ok"]);
});
