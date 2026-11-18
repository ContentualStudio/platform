/**
 * The one shape a Server Action or Route Handler answers with.
 *
 * A discriminated union rather than a thrown error, because the caller is a
 * component that has to render something either way: `ok` narrows the result, so
 * reading `result.data` without checking is a compile error rather than a runtime
 * `undefined`.
 *
 * This is the shape the app already used by hand — see the original
 * `CompleteStage2ActionResult` — promoted to one definition so every feature
 * answers alike and `code` can be switched on.
 */
export type ActionResult<Data> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function ok<Data>(data: Data): ActionResult<Data> {
  return { ok: true, data };
}

export function failed<Data = never>(
  code: string,
  message: string,
): ActionResult<Data> {
  return { ok: false, code, message };
}

/**
 * Failure codes owned by the wrappers themselves.
 *
 * Features supply their own codes for their own failures; these three are the
 * ones no feature should have to invent.
 */
export const sharedFailureCodes = {
  /** The input did not match the action's schema. */
  invalidInput: "INVALID_INPUT",
  /** The named limiter refused this call before the handler ran. */
  rateLimited: "RATE_LIMITED",
  /** Something threw that the action did not anticipate. */
  unexpected: "UNEXPECTED_ERROR",
} as const;

/**
 * Thrown by a handler to answer with a specific failure.
 *
 * The wrapper turns this into `{ ok: false, code, message }` untouched, and does
 * *not* report it: a deliberate, named failure is the action working, not
 * breaking. Anything else that throws is a bug and is captured.
 */
export class ActionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ActionFailure";
  }
}

/**
 * Whether a thrown value is a deliberate answer rather than a fault.
 *
 * This one rule decides everything about how a throw is handled: a named failure
 * is passed to the caller with its own code and message and is *not* reported,
 * while anything else is a bug — reported to PostHog, and answered with a
 * prepared message that leaks nothing about it.
 *
 * Named here, and shared by both wrappers, so the two cannot drift into
 * disagreeing about what counts as an error.
 */
export function isNamedFailure(error: unknown): error is ActionFailure {
  return error instanceof ActionFailure;
}
