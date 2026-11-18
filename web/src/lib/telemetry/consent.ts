/**
 * The user's tracking consent, as browser product analytics sees it.
 *
 * This module is the gate, not the banner. The consent UI that *writes* the
 * cookie belongs to Compliance; until it ships, every visitor reads as `denied`
 * and the browser captures no product analytics. That is the correct failure
 * direction: an unasked user has not agreed to anything.
 *
 * Error capture is deliberately outside this gate. Keeping the service healthy is
 * not marketing, and the error path carries no marketing identifiers — see
 * `telemetry/client.ts` for how the two are separated in one client.
 */

export const trackingConsentCookie = "contentual_tracking_consent";

// Only these two values mean anything. Anything else — absent, malformed, a
// stale value from an older banner — reads as denied.
export const trackingConsentValues = {
  granted: "granted",
  denied: "denied",
} as const;

export type TrackingConsent =
  (typeof trackingConsentValues)[keyof typeof trackingConsentValues];

/**
 * Reads consent out of a cookie string.
 *
 * Takes the raw header/`document.cookie` value rather than reaching for a
 * runtime-specific cookie API, so the same rule applies on the server and in the
 * browser and can be tested without either.
 */
export function trackingConsentFrom(
  cookieHeader: string | undefined | null,
): TrackingConsent {
  if (!cookieHeader) {
    return trackingConsentValues.denied;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== trackingConsentCookie) {
      continue;
    }

    const value = decodeURIComponent(part.slice(separator + 1).trim());

    return value === trackingConsentValues.granted
      ? trackingConsentValues.granted
      : trackingConsentValues.denied;
  }

  return trackingConsentValues.denied;
}

export function hasTrackingConsent(
  cookieHeader: string | undefined | null,
): boolean {
  return trackingConsentFrom(cookieHeader) === trackingConsentValues.granted;
}

/**
 * Browser-side read of the same cookie.
 *
 * Returns denied during server rendering, where there is no `document` — which is
 * also the safe answer: a client component must not start capturing before it can
 * see what the user chose.
 */
export function hasTrackingConsentInBrowser(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return hasTrackingConsent(document.cookie);
}
