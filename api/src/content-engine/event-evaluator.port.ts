import type { ContentEvent } from "./content-event";

// The seam between durable event delivery and rule evaluation. The dispatcher
// owns claims, leases and retries; whatever implements this owns rule
// selection, condition evaluation and effects — none of which exist yet.
//
// An implementation must be idempotent: the dispatcher guarantees at-least-once
// delivery, not exactly-once. A crash between a successful evaluation and the
// fenced completion update leaves the row pending, and it will be evaluated
// again.
export interface ContentEventEvaluator {
  evaluate(event: ContentEvent): Promise<void>;
}

// Nest cannot inject an interface, so the port is bound by symbol.
export const CONTENT_EVENT_EVALUATOR = Symbol("CONTENT_EVENT_EVALUATOR");
