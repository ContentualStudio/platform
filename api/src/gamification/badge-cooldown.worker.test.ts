import * as assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type {
  BadgeCooldownProcessor,
  BadgeCooldownSummary,
} from "./badge-cooldown.processor";
import { BadgeCooldownWorker } from "./badge-cooldown.worker";

function build(options: {
  enabled?: boolean;
  processDue?: () => Promise<BadgeCooldownSummary>;
}) {
  let calls = 0;

  const config = {
    get(key: string) {
      if (key === "gamification.badgeCooldown.enabled") {
        return options.enabled ?? true;
      }
      return 5;
    },
  } as unknown as ConfigService;

  const processor = {
    async processDue() {
      calls += 1;
      return (
        (await options.processDue?.()) ?? {
          released: 0,
          suppressed: 0,
          failed: 0,
        }
      );
    },
  } as unknown as BadgeCooldownProcessor;

  return {
    worker: new BadgeCooldownWorker(config, processor),
    calls: () => calls,
  };
}

test("the worker polls the queue once the application boots", async () => {
  const harness = build({});

  harness.worker.onApplicationBootstrap();
  await delay(40);
  await harness.worker.onApplicationShutdown();

  assert.ok(harness.calls() > 0, "the queue was never polled");
});

test("a disabled worker never polls", async () => {
  const harness = build({ enabled: false });

  harness.worker.onApplicationBootstrap();
  await delay(40);
  await harness.worker.onApplicationShutdown();

  assert.equal(harness.calls(), 0);
});

test("a tick that throws does not stop the worker", async () => {
  const harness = build({
    processDue: async () => {
      throw new Error("candidate query failed");
    },
  });

  harness.worker.onApplicationBootstrap();
  await delay(60);
  await harness.worker.onApplicationShutdown();

  assert.ok(harness.calls() > 1, "the worker stopped after one failure");
});

test("no tick runs after shutdown", async () => {
  const harness = build({});

  harness.worker.onApplicationBootstrap();
  await delay(20);
  await harness.worker.onApplicationShutdown();
  const atShutdown = harness.calls();
  await delay(40);

  assert.equal(harness.calls(), atShutdown);
});
