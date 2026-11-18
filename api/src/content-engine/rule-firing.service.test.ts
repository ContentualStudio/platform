import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
  type AppPostgresUserAttributeReader,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import {
  PermanentEffectError,
  type ContentEngineEffectDispatcher,
} from "./effect-dispatcher.port";
import type { RuntimeEngineRule } from "./engine-rule";
import type { FiringLedgerService, Reservation } from "./firing-ledger.service";
import { RuleFiringService } from "./rule-firing.service";

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

const reader: AppPostgresUserAttributeReader = {
  async read() {
    return null;
  },
};

function build(options: {
  reserve?: () => Reservation | Promise<Reservation>;
  reserveThrows?: Error;
  dispatchThrows?: Error;
} = {}) {
  const reservations: unknown[] = [];
  const dispatched: string[] = [];

  const ledger = {
    async reserve(context: unknown) {
      if (options.reserveThrows) {
        throw options.reserveThrows;
      }

      reservations.push(context);

      return (
        (await options.reserve?.()) ?? {
          fresh: true,
          ledgerId: "ledger-1",
          leaseToken: "lease-1",
          attempt: 1,
        }
      );
    },
  } as unknown as FiringLedgerService;

  const effects: ContentEngineEffectDispatcher = {
    async dispatch(input) {
      dispatched.push(input.rule.id);

      if (options.dispatchThrows) {
        throw options.dispatchThrows;
      }
    },
  };

  return {
    firing: new RuleFiringService(ledger, effects),
    reservations,
    dispatched,
  };
}

test("a rule with no conditions qualifies, reserves and fires", async () => {
  const harness = build();

  const result = await harness.firing.fire(rule(), taskCompleted(), reader);

  assert.deepEqual(result, { outcome: "fired", qualified: true });
  assert.deepEqual(harness.dispatched, ["rule-1"]);
});

test("a condition that does not hold skips before reserving, and reports itself unqualified", async () => {
  const harness = build();

  const result = await harness.firing.fire(
    rule({
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "contentType",
          operator: operatorTokens.eq,
          value: "carousel",
        },
      ],
    }),
    taskCompleted(),
    reader,
  );

  assert.equal(result.outcome, "skipped");
  assert.equal(result.qualified, false);
  // The gate is never reached, so nothing is reserved and nothing is fired.
  assert.deepEqual(harness.reservations, []);
  assert.deepEqual(harness.dispatched, []);
});

// Every outcome from the gate onwards means the conditions held. The evaluator
// reports "qualified" straight from this flag rather than inferring it from the
// reason string, so the flag is the contract.
for (const [reason, expected] of [
  ["already_fired", true],
  ["reservation_held", true],
  ["invalid_scope", true],
] as const) {
  test(`a ${reason} reservation skips but still counts as qualified`, async () => {
    const harness = build({ reserve: () => ({ fresh: false, reason }) });

    const result = await harness.firing.fire(rule(), taskCompleted(), reader);

    assert.equal(result.outcome, "skipped");
    assert.equal(result.qualified, expected);
    assert.deepEqual(harness.dispatched, []);
  });
}

test("a reservation that throws is a retryable reserve-stage failure", async () => {
  const harness = build({ reserveThrows: new Error("connection reset") });

  const result = await harness.firing.fire(rule(), taskCompleted(), reader);

  assert.deepEqual(result, {
    outcome: "failed",
    stage: "reserve",
    error: "connection reset",
    retryable: true,
    qualified: true,
  });
});

test("an effect that throws an ordinary error is retryable", async () => {
  const harness = build({ dispatchThrows: new Error("deadlock detected") });

  const result = await harness.firing.fire(rule(), taskCompleted(), reader);

  assert.equal(result.outcome, "failed");
  assert.equal(result.stage, "effect");
  assert.equal(result.retryable, true);
});

test("an effect that throws a PermanentEffectError is not retryable", async () => {
  const harness = build({
    dispatchThrows: new PermanentEffectError("badgeKey is blank"),
  });

  const result = await harness.firing.fire(rule(), taskCompleted(), reader);

  assert.equal(result.outcome, "failed");
  assert.equal(result.stage, "effect");
  assert.equal(result.retryable, false);
});

test("a condition read that throws is a retryable condition-stage failure, and never qualifies", async () => {
  const harness = build();

  const result = await harness.firing.fire(
    rule({
      conditions: [
        {
          source: conditionSourceTokens.user,
          field: "programmes_completed",
          operator: operatorTokens.gte,
          value: 2,
        },
      ],
    }),
    taskCompleted(),
    {
      async read() {
        throw new Error("attribute read failed");
      },
    },
  );

  assert.deepEqual(result, {
    outcome: "failed",
    stage: "condition",
    error: "attribute read failed",
    retryable: true,
    qualified: false,
  });
  assert.deepEqual(harness.reservations, []);
});

test("the dedupe scope is keyed on the payload's programme, never the effect's", async () => {
  const harness = build();

  await harness.firing.fire(
    rule({
      dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
      // An authored effect naming a *different* programme must not move the key.
      effectParams: { programmeSourceId: "programme-elsewhere" },
      effectType: effectTypeTokens.unlockProgramme,
    }),
    taskCompleted({ programmeId: "programme-from-payload" }),
    reader,
  );

  assert.deepEqual(harness.reservations, [
    {
      ruleId: "rule-1",
      userId: "user-1",
      dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
      programmeId: "programme-from-payload",
      eventId: "event-1",
    },
  ]);
});
