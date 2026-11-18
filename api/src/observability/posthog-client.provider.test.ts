import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import {
  PostHogClientProvider,
  type PostHogCapture,
} from "./posthog-client.provider";

function configFor(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

// The credential-free state is the one local and CI runs live in, so it has to
// be a working configuration rather than a degraded one.
test("no api key yields no client at all", () => {
  const provider = new PostHogClientProvider(configFor({}));

  assert.equal(provider.client, null);
});

test("an api key yields a client", () => {
  const provider = new PostHogClientProvider(
    configFor({
      "posthog.apiKey": "phc_test",
      "posthog.host": "https://eu.i.posthog.com",
    }),
  );

  assert.notEqual(provider.client, null);
});

test("shutting down with no client does not throw", async () => {
  const provider = new PostHogClientProvider(configFor({}));

  await assert.doesNotReject(() => provider.onApplicationShutdown());
});

// posthog-node batches captures and flushes on a timer, so a process that exits
// without flushing drops whatever is queued — and Railway SIGTERMs on every
// deploy. Named onApplicationShutdown because Nest only calls hooks it knows
// about.
test("flushes the client through Nest's shutdown lifecycle hook", async () => {
  let flushed = false;
  const provider = new PostHogClientProvider(configFor({}));

  (provider as { client: PostHogCapture | null }).client = {
    capture() {},
    captureException() {},
    async shutdown() {
      flushed = true;
    },
  };

  await provider.onApplicationShutdown();

  assert.equal(flushed, true);
});

test("a throwing flush is swallowed so shutdown still completes", async () => {
  const provider = new PostHogClientProvider(configFor({}));

  (provider as { client: PostHogCapture | null }).client = {
    capture() {},
    captureException() {},
    async shutdown() {
      throw new Error("flush failed");
    },
  };

  await assert.doesNotReject(() => provider.onApplicationShutdown());
});
