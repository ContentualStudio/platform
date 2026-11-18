import * as assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { RuleBackfillService } from "./rule-backfill.service";
import { RuleBackfillWorker } from "./rule-backfill.worker";

function build(options: {
  enabled?: boolean;
  pollMs?: number;
  processQueued?: () => Promise<unknown[]>;
}) {
  const calls: number[] = [];

  const config = {
    get(key: string) {
      if (key === "contentEngineBackfill.worker.enabled") {
        return options.enabled ?? true;
      }
      return options.pollMs ?? 5;
    },
  } as unknown as ConfigService;

  const backfills = {
    async processQueued(maxRuns: number) {
      calls.push(maxRuns);
      return (await options.processQueued?.()) ?? [];
    },
  } as unknown as RuleBackfillService;

  return { worker: new RuleBackfillWorker(config, backfills), calls };
}

// The whole point of the worker: an admin-triggered rollout starts on its own.
// Without it the endpoint enqueues work nothing picks up, and a queue whose
// consumer has to be remembered is a to-do item, not a background job.
test("the worker polls the queue once the application boots", async () => {
  const harness = build({});

  harness.worker.onApplicationBootstrap();
  await delay(40);
  await harness.worker.onApplicationShutdown();

  assert.ok(harness.calls.length > 0, "the queue was never polled");
});

test("one run is claimed per tick, so a shutdown lands promptly", async () => {
  const harness = build({});

  harness.worker.onApplicationBootstrap();
  await delay(40);
  await harness.worker.onApplicationShutdown();

  assert.ok(harness.calls.every((maxRuns) => maxRuns === 1));
});

test("an explicitly disabled worker never polls", async () => {
  const harness = build({ enabled: false });

  harness.worker.onApplicationBootstrap();
  await delay(40);
  await harness.worker.onApplicationShutdown();

  assert.deepEqual(harness.calls, []);
});

// A failed run has already been recorded against its own row. Rethrowing from
// the timer would take the API process down over one bad rollout.
test("a tick that throws does not stop the worker", async () => {
  let thrown = 0;
  const harness = build({
    processQueued: async () => {
      thrown += 1;
      throw new Error("claim failed");
    },
  });

  harness.worker.onApplicationBootstrap();
  await delay(60);
  await harness.worker.onApplicationShutdown();

  assert.ok(thrown > 1, "the worker stopped after the first failure");
});

/**
 * Shutdown waits for the claim in flight.
 *
 * A tick abandoned mid-page leaves the run holding a lease nobody is working,
 * and the next worker has to wait the full lease out before it can take over.
 */
test("shutdown waits for the tick in flight", async () => {
  let finished = false;
  const harness = build({
    processQueued: async () => {
      await delay(30);
      finished = true;
      return [];
    },
  });

  harness.worker.onApplicationBootstrap();
  await delay(10);
  await harness.worker.onApplicationShutdown();

  assert.equal(finished, true);
});

test("no further ticks are scheduled after shutdown", async () => {
  const harness = build({});

  harness.worker.onApplicationBootstrap();
  await delay(30);
  await harness.worker.onApplicationShutdown();

  const seen = harness.calls.length;
  await delay(40);

  assert.equal(harness.calls.length, seen);
});
