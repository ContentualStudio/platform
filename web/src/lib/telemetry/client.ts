import posthog from "posthog-js";
import { posthogHost, posthogKey } from "./config";
import { hasTrackingConsentInBrowser } from "./consent";

/**
 * The browser's PostHog client.
 *
 * Two jobs with different consent rules live in this one client, which is the
 * whole reason this module is not three lines:
 *
 * - **Product analytics** — pageviews and UI interactions. Gated on the user's
 *   tracking consent, and off until they grant it.
 * - **Error capture** — needed to keep the service healthy. Runs regardless, and
 *   carries no marketing identifiers: no person profile, no autocapture, no
 *   session recording, no pageviews.
 *
 * PostHog's own `opt_out_capturing()` would gate *everything*, error capture
 * included, so consent is applied to the capture surfaces instead: the features
 * that identify and follow a person are the ones switched on by consent, and
 * `capture_exceptions` is switched on either way.
 */

/**
 * PostHog's own convention for carrying a browser's identity to a backend, and
 * the header the api reads to attribute pre-auth moments to this browser.
 */
export const POSTHOG_DISTINCT_ID_HEADER = "x-posthog-distinct-id";

let started = false;

export function initTelemetry(): void {
  if (started || !posthogKey || typeof window === "undefined") {
    return;
  }

  started = true;

  const consented = hasTrackingConsentInBrowser();

  posthog.init(posthogKey, {
    api_host: posthogHost,

    // Never build a person profile from an anonymous visitor. Combined with the
    // consent gate this means an un-consented visitor is only ever a transient
    // error report, never a tracked person.
    person_profiles: "identified_only",

    // Product-analytics surfaces, all consent-gated.
    autocapture: consented,
    capture_pageview: consented,
    capture_pageleave: consented,
    disable_session_recording: !consented,

    // Health, not marketing. On either way.
    capture_exceptions: true,

    // Without consent nothing may be written to the device, so the distinct id
    // lives in memory for this tab only and is gone when it closes.
    persistence: consented ? "localStorage+cookie" : "memory",
  });
}

/**
 * Ties this browser's history to the authenticated user.
 *
 * This is what reconciles the pre-auth funnel: the api captures the anonymous
 * moments against the distinct id below, and `identify` tells PostHog that
 * anonymous person and this user are the same one.
 *
 * Only under consent. Identifying an un-consented visitor would create exactly
 * the person profile the gate exists to prevent.
 */
export function identifyUser(userId: string): void {
  if (!started || !hasTrackingConsentInBrowser()) {
    return;
  }

  posthog.identify(userId);
}

/**
 * Forgets the current person on sign-out.
 *
 * Without this the next user of a shared browser inherits the previous one's
 * distinct id, and their events land on the wrong person.
 */
export function resetTelemetryIdentity(): void {
  if (!started) {
    return;
  }

  posthog.reset();
}

/**
 * Reports an error React caught at a boundary.
 *
 * PostHog's `capture_exceptions` installs `window` handlers, which a React error
 * boundary never lets an error reach — so anything a boundary renders a fallback
 * for has to be reported by hand, or the app's most visible failures become its
 * least visible ones.
 *
 * Not gated on consent: this is health, not marketing, and it carries no
 * marketing identifiers.
 */
export function captureClientError(
  error: unknown,
  context: { operation: string; digest?: string },
): void {
  if (!started) {
    return;
  }

  try {
    posthog.captureException(error, context);
  } catch {
    // The reporting channel is the thing that failed; there is nothing else to
    // try, and throwing here would replace an error screen with a blank one.
  }
}

/**
 * This browser's PostHog distinct id, for the api to attribute pre-auth moments
 * to.
 *
 * Returns nothing when PostHog never started, so a caller sends no header rather
 * than a placeholder the api would have to recognise and discard.
 */
export function telemetryDistinctId(): string | undefined {
  if (!started) {
    return undefined;
  }

  return posthog.get_distinct_id() || undefined;
}
