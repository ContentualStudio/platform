import type { Reservation } from "./firing-ledger.service";
import type { ContentEvent } from "./content-event";
import type { RuntimeEngineRule } from "./engine-rule";

// Only a fresh reservation can reach a handler. Typing the field as the
// `fresh: true` member rather than the full union makes that a compile-time
// guarantee: there is no way to hand a handler a reservation somebody else
// holds, so the "did we check?" question cannot be answered wrongly at runtime.
export interface EffectDispatchInput {
  readonly rule: RuntimeEngineRule;
  readonly event: ContentEvent;
  readonly reservation: Extract<Reservation, { fresh: true }>;
}

/**
 * An effect that cannot succeed however many times it is attempted.
 *
 * The distinction matters to delivery, not to the handler. A transient failure
 * — a lost connection, a lock timeout — must leave the event retryable, or the
 * effect is silently lost. A permanent one — a rule naming a badge that does
 * not exist, or carrying an effect type with no handler — would retry forever
 * and never succeed, because the fix is re-authoring the rule.
 *
 * Handlers raise this for the second kind; everything else is treated as
 * transient, which is the safe default when a handler is unsure.
 */
export class PermanentEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEffectError";
  }
}

/**
 * The seam between rule evaluation and the effect handlers.
 *
 * The evaluator decides *whether* an effect may run and reserves the right to
 * run it; whatever implements this decides *what* running it means, and owns
 * completing the reservation. That split is deliberate — see
 * FiringLedgerService for why completion belongs to the handler: only the
 * handler knows whether its write can share a transaction with the fired-mark,
 * needs `ledgerId` as an idempotency key, or goes through an outbox.
 *
 * A handler that throws leaves the reservation unmarked, so the ledger's lease
 * rules govern the retry rather than this port.
 */
export interface ContentEngineEffectDispatcher {
  dispatch(input: EffectDispatchInput): Promise<void>;
}

// Nest cannot inject an interface, so the port is bound by symbol.
export const CONTENT_ENGINE_EFFECT_DISPATCHER = Symbol(
  "CONTENT_ENGINE_EFFECT_DISPATCHER",
);
