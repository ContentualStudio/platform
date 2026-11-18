import type { ProductEventIdentity, ProductEventName } from "./product-events";

export interface ProductEventInput {
  readonly identity: ProductEventIdentity;
  readonly event: ProductEventName;
  readonly properties?: Record<string, unknown>;
  /**
   * A stable identity for this occurrence, used as the PostHog event `uuid`.
   *
   * PostHog drops a repeat of a uuid it has already seen, which is what makes
   * an at-least-once capture path safe to retry. Supply it wherever the caller
   * has a natural key for the fact — a Content Engine event id, a firing ledger
   * id — and leave it off where a repeat is genuinely a second occurrence.
   */
  readonly uuid?: string;
}

/**
 * Where a product moment is reported.
 *
 * Every implementation must be best-effort. Product analytics sits on paths that
 * carry the product itself — event delivery, effect dispatch, request handling —
 * and an implementation that threw would turn a PostHog outage into an outage of
 * whatever it was observing. The Content Engine's dispatcher is the sharpest
 * case: a thrown capture would leave the event pending and re-run every effect
 * that had already fired.
 */
export interface ProductAnalytics {
  capture(input: ProductEventInput): void;
}

// Nest cannot inject an interface, so the port is bound by symbol. Consumers
// outside this module depend on the port, never on the concrete service.
export const PRODUCT_ANALYTICS = Symbol("PRODUCT_ANALYTICS");

/**
 * A `ProductAnalytics` that reports nothing.
 *
 * For the callers that build their collaborators by hand rather than through
 * Nest — the demo and replay scripts, and the tests that are about something
 * else. It exists so the injected port can stay *required*: an `@Optional()`
 * dependency would silently fall back to doing nothing in production the day the
 * provider went missing, and nobody would notice an absence of events.
 */
export const noopProductAnalytics: ProductAnalytics = {
  capture() {},
};
