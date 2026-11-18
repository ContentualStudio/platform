import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import posthogConfig, { defaultPostHogHost } from "./posthog.config";

const KEYS = ["POSTHOG_API_KEY", "POSTHOG_HOST"] as const;
const original = new Map(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function load(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  return posthogConfig().posthog;
}

test("a configured key enables capture", () => {
  const config = load({ POSTHOG_API_KEY: "phc_test" });

  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "phc_test");
});

test("an absent key disables capture without erroring", () => {
  const config = load({});

  assert.equal(config.enabled, false);
  assert.equal(config.apiKey, undefined);
});

test("a blank key disables capture", () => {
  const config = load({ POSTHOG_API_KEY: "   " });

  assert.equal(config.enabled, false);
  assert.equal(config.apiKey, undefined);
});

// The region is the point of the default. A deployment that forgets to set
// POSTHOG_HOST must land in the EU, not the US.
test("the host defaults to PostHog EU cloud", () => {
  const config = load({ POSTHOG_API_KEY: "phc_test" });

  assert.equal(config.host, defaultPostHogHost);
  assert.equal(config.host, "https://eu.i.posthog.com");
});

test("a configured host overrides the default", () => {
  const config = load({
    POSTHOG_API_KEY: "phc_test",
    POSTHOG_HOST: "https://self-hosted.example.com",
  });

  assert.equal(config.host, "https://self-hosted.example.com");
});

// `POSTHOG_API_KEY=""` is the ordinary way to write "no credential", and the
// hand-rolled env loader in database/data-source.ts — which every script and
// migration uses — hands the quotes through. A client built around a junk key
// drops every event silently, which reads exactly like a working one.
test("a quoted empty key disables capture", () => {
  for (const quoted of ['""', "''", '"   "']) {
    const config = load({ POSTHOG_API_KEY: quoted });

    assert.equal(config.enabled, false, `${quoted} must not enable capture`);
    assert.equal(config.apiKey, undefined);
  }
});

test("a quoted key is unwrapped rather than used with its quotes", () => {
  const config = load({
    POSTHOG_API_KEY: '"phc_test"',
    POSTHOG_HOST: '"https://eu.i.posthog.com"',
  });

  assert.equal(config.apiKey, "phc_test");
  assert.equal(config.host, "https://eu.i.posthog.com");
});
