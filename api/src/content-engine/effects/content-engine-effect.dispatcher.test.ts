import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource, EntityManager } from "typeorm";
import {
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  type EffectType,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "../content-event";
import type { EffectDispatchInput } from "../effect-dispatcher.port";
import type { FiringLedgerService } from "../firing-ledger.service";
import type {
  ProductAnalytics,
  ProductEventInput,
} from "../../observability/product-analytics.port";
import { productEventTokens } from "../../observability/product-events";
import { ContentEngineEffectRouter } from "./content-engine-effect.dispatcher";
import type {
  ContentEngineEffectHandler,
  EffectWriteOutcome,
} from "./effect-handler";
import { EffectParameterError } from "./effect-parameters";

function input(effectType: EffectType): EffectDispatchInput {
  return {
    rule: {
      id: "rule-1",
      key: "a-rule",
      triggerEvent: eventNameTokens.taskCompleted,
      conditions: [],
      effectType,
      effectParams: {},
      dedupeScope: dedupeScopeTokens.oncePerUser,
    },
    event: {
      id: "event-1",
      eventName: eventNameTokens.taskCompleted,
      userId: "user-1",
      payload: {
        userId: "user-1",
        programmeId: "programme-1",
        taskId: "task-1",
        contentType: "video",
      },
    } as ContentEvent,
    reservation: {
      fresh: true,
      ledgerId: "ledger-1",
      leaseToken: "lease-1",
      attempt: 1,
    },
  };
}

function build(
  options: {
    handlerThrows?: boolean;
    markThrows?: boolean;
    outcome?: EffectWriteOutcome;
    captureThrows?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const captured: ProductEventInput[] = [];
  let committed = false;

  // Generic like the real `transaction`, which returns whatever the work
  // returns. The router carries the handler's outcome out through it.
  const dataSource = {
    async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
      calls.push("begin");
      const result = await work({} as EntityManager);
      calls.push("commit");
      committed = true;
      return result;
    },
  } as unknown as DataSource;

  const analytics: ProductAnalytics = {
    capture(event) {
      calls.push("capture");
      if (options.captureThrows) {
        throw new Error("posthog unreachable");
      }
      captured.push(event);
    },
  };

  const ledger = {
    async markFiredOrThrow() {
      calls.push("markFired");
      if (options.markThrows) {
        throw new Error("stale_reservation");
      }
    },
  } as unknown as FiringLedgerService;

  const handler = (name: string): ContentEngineEffectHandler => ({
    async write() {
      calls.push(`write:${name}`);
      if (options.handlerThrows) {
        throw new Error("write failed");
      }
      return options.outcome;
    },
  });

  const router = new ContentEngineEffectRouter(
    dataSource,
    ledger,
    analytics,
    handler("suggest") as never,
    handler("unlock") as never,
    handler("prompt") as never,
    handler("badge") as never,
    handler("message") as never,
  );

  return { router, calls, captured, wasCommitted: () => committed };
}

const routedEffects: ReadonlyArray<[EffectType, string]> = [
  [effectTypeTokens.suggestProgramme, "write:suggest"],
  [effectTypeTokens.unlockProgramme, "write:unlock"],
  [effectTypeTokens.promptCall, "write:prompt"],
  [effectTypeTokens.awardBadge, "write:badge"],
  [effectTypeTokens.inAppMessage, "write:message"],
];

for (const [effectType, expected] of routedEffects) {
  test(`routes ${effectType} to its handler`, async () => {
    const { router, calls } = build();

    await router.dispatch(input(effectType));

    assert.deepEqual(calls, ["begin", expected, "markFired", "commit"]);
  });
}

test("all five v1 effects have a handler", async () => {
  for (const [effectType] of routedEffects) {
    const { router } = build();
    await assert.doesNotReject(() => router.dispatch(input(effectType)));
  }
});

test("grant_call has no handler and is never executed", async () => {
  const { router, calls, wasCommitted } = build();

  await assert.rejects(
    () => router.dispatch(input(effectTypeTokens.grantCall)),
    EffectParameterError,
  );

  // Rejected before a transaction is even opened, so nothing can be written.
  assert.deepEqual(calls, []);
  assert.equal(wasCommitted(), false);
});

test("the effect write and the ledger completion share one transaction", async () => {
  const { router, calls } = build();

  await router.dispatch(input(effectTypeTokens.awardBadge));

  assert.equal(calls[0], "begin");
  assert.ok(calls.indexOf("write:badge") < calls.indexOf("markFired"));
  assert.equal(calls[calls.length - 1], "commit");
});

test("a refused ledger completion prevents the commit", async () => {
  const { router, wasCommitted } = build({ markThrows: true });

  await assert.rejects(
    () => router.dispatch(input(effectTypeTokens.awardBadge)),
    /stale_reservation/,
  );
  assert.equal(
    wasCommitted(),
    false,
    "the effect must not commit without its fired-mark",
  );
});

test("a failing handler never marks the reservation fired", async () => {
  const { router, calls } = build({ handlerThrows: true });

  await assert.rejects(() => router.dispatch(input(effectTypeTokens.awardBadge)));
  assert.ok(!calls.includes("markFired"));
});

const badgeOutcome: EffectWriteOutcome = {
  analytics: {
    event: productEventTokens.badgeEarned,
    properties: { badgeId: "badge-1", ruleId: "rule-1" },
  },
};

// PostHog has no way to take an event back, so a badge must not be announced
// until the transaction that awarded it has committed.
test("reports a handler outcome only after the transaction commits", async () => {
  const { router, calls, captured } = build({ outcome: badgeOutcome });

  await router.dispatch(input(effectTypeTokens.awardBadge));

  assert.deepEqual(calls, [
    "begin",
    "write:badge",
    "markFired",
    "commit",
    "capture",
  ]);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, productEventTokens.badgeEarned);
  assert.deepEqual(captured[0].identity, { userId: "user-1" });
  assert.deepEqual(captured[0].properties, {
    badgeId: "badge-1",
    ruleId: "rule-1",
  });
});

// The reservation is one per rule firing, so it is the natural "this happened
// once" key for PostHog to deduplicate on.
test("keys the report on the firing ledger reservation", async () => {
  const { router, captured } = build({ outcome: badgeOutcome });

  await router.dispatch(input(effectTypeTokens.awardBadge));

  assert.equal(captured[0].uuid, "ledger-1");
});

// Most effects are internal bookkeeping. An already-held badge returns nothing
// too, which is how a re-award produces no second moment.
test("reports nothing when the handler returns no outcome", async () => {
  const { router, calls, captured } = build();

  await router.dispatch(input(effectTypeTokens.awardBadge));

  assert.equal(captured.length, 0);
  assert.equal(calls.includes("capture"), false);
});

test("reports nothing when the reservation was refused", async () => {
  const { router, captured } = build({
    outcome: badgeOutcome,
    markThrows: true,
  });

  await assert.rejects(() => router.dispatch(input(effectTypeTokens.awardBadge)));

  assert.equal(captured.length, 0);
});

// The effect is already durable by this point: a throw here would fail a
// dispatch that succeeded, and hand the event back for a retry that re-runs
// nothing.
test("a throwing capture does not fail a committed effect", async () => {
  const { router, wasCommitted } = build({
    outcome: badgeOutcome,
    captureThrows: true,
  });

  await assert.doesNotReject(() =>
    router.dispatch(input(effectTypeTokens.awardBadge)),
  );
  assert.equal(wasCommitted(), true);
});
