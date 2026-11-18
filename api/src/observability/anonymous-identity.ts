import type { Request } from "express";
import type { ProductEventIdentity } from "./product-events";

/**
 * PostHog's own convention for carrying a browser's identity to a backend.
 *
 * The header name is the library's (`posthog-node` reads exactly this in its
 * Express and Nest integrations), but it is not on the package's public export
 * map, so it is restated here rather than reached for through a deep import that
 * a minor release could move.
 */
export const POSTHOG_DISTINCT_ID_HEADER = "x-posthog-distinct-id";

// Long enough for a UUID and PostHog's own longer forms, short enough that a
// header cannot be used to push arbitrary bulk into an analytics property.
const maxDistinctIdLength = 200;

// Deliberately narrow: PostHog distinct ids are opaque tokens, so anything
// outside this alphabet is a caller sending something other than one.
const allowedDistinctId = /^[A-Za-z0-9._:-]+$/;

/**
 * Reads the browser's PostHog distinct id off a request.
 *
 * SECURITY: this value is client-supplied and unverifiable — any caller can
 * claim any distinct id, which is inherent to anonymous analytics rather than
 * specific to this header. The exposure is bounded to inserting a pre-auth
 * analytics event into someone else's PostHog timeline: it grants no access, and
 * it is never used for authorisation, only for attribution. It is sanitised to
 * shape and length so it cannot become an injection or a payload of its own.
 */
export function anonymousIdFromRequest(request: Request): string | undefined {
  const raw = request.headers[POSTHOG_DISTINCT_ID_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();

  if (!value || value.length > maxDistinctIdLength) {
    return undefined;
  }

  return allowedDistinctId.test(value) ? value : undefined;
}

/**
 * The identity to capture a pre-auth moment against.
 *
 * Pre-auth moments have to carry the distinct id the browser already generated.
 * `posthog.identify()` on the web, immediately after authentication succeeds, is
 * what reconciles that anonymous history onto the real user — so a
 * server-invented id here would strand the whole pre-auth funnel on a person
 * PostHog can never join up.
 *
 * `undefined` when the browser sent nothing: there is then no identity worth
 * inventing, and the caller skips the capture rather than attributing the moment
 * to a fiction.
 */
export function preAuthIdentity(
  request: Request,
): ProductEventIdentity | undefined {
  const anonymousId = anonymousIdFromRequest(request);

  return anonymousId ? { anonymousId } : undefined;
}
