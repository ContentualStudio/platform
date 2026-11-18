import { initTelemetry } from "./lib/telemetry/client";

/**
 * Starts PostHog in the browser, before React hydrates.
 *
 * This file is the framework's own client-instrumentation seam and runs after the
 * document loads but before hydration, which is the earliest point an error can
 * be caught — a provider component would only start once React was already
 * running, and would miss anything that failed on the way there.
 *
 * `initTelemetry` reads the consent cookie itself: product-analytics surfaces
 * stay off until the user grants tracking consent, while exception capture runs
 * either way. See `lib/telemetry/client.ts`.
 *
 * Synchronous and top-level on purpose — only that is guaranteed to complete
 * before hydration — and wrapped, because instrumentation must never be the
 * reason an app fails to start.
 */
try {
  initTelemetry();
} catch {
  // A telemetry client that cannot start is not a reason to break the app.
}
