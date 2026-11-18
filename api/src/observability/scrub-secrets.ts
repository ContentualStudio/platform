/**
 * The single redaction marker, defined here rather than in redact.ts because
 * redact.ts now calls into this module: keeping the constant on the imported
 * side is what stops the two files forming an import cycle.
 */
export const REDACTED = "[redacted]";

/**
 * Value-based scrubbing, the counterpart to redact.ts's key-based redaction.
 *
 * `redactProperties` can only act on a *key* it recognises. That covers a token
 * arriving as `{ accessToken: "..." }`, which is how deliberate call sites pass
 * one. It cannot see a token that has been interpolated into a message string —
 * a url in an error, a request line in a debug log, a stack frame — and that is
 * exactly how a secret reaches a log by accident.
 *
 * So this matches on shape instead. Every pattern here is one that has no
 * innocent reading: Instagram and Facebook token prefixes, an `access_token`
 * query parameter, an Authorization header value. The long-base64url rule is
 * the backstop for token formats Meta has not shipped yet; it is deliberately
 * set at 40 characters so ordinary ids, hashes and slugs pass through.
 */
interface ScrubRule {
  readonly pattern: RegExp;
  /**
   * Explicit per-rule replacement. Deliberately not one shared callback:
   * String.replace passes the match offset where a group would be for a
   * pattern that has none, so a single `(match, name) => ...` callback silently
   * treats that number as a capture and emits "17=[redacted]".
   */
  readonly replace: (match: string, ...groups: string[]) => string;
}

// The query/body parameters whose value is always a secret. Shared with the
// pre-test below so the two cannot disagree about what is worth looking for.
const secretParams = "access_token|client_secret|refresh_token|signed_request|code";

const rules: readonly ScrubRule[] = [
  // Instagram long-lived and Facebook user tokens.
  { pattern: /\bIG[A-Za-z0-9_-]{20,}/g, replace: () => REDACTED },
  { pattern: /\bEA[A-Za-z0-9]{20,}/g, replace: () => REDACTED },
  // `?access_token=...`, `&client_secret=...` and friends, in urls or bodies.
  // The parameter name is kept so a scrubbed line still says which secret was
  // there; only the value goes.
  {
    pattern: new RegExp(`\\b(${secretParams})=([^&\\s"']+)`, "gi"),
    replace: (_match, name) => `${name}=${REDACTED}`,
  },
  // Authorization headers, however they were stringified.
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, replace: () => REDACTED },
  // Backstop for token formats Meta has not shipped yet: a long base64url run
  // that mixes lower case, upper case and digits. All three are required
  // because over-redaction is its own failure — a rule keyed on length alone
  // also eats hex digests, long single-case ids and any 40-character stretch of
  // ordinary text, and a log nobody can read is not a safer log. Last in the
  // list, so the named rules above win and produce the more readable
  // `access_token=[redacted]` form.
  {
    pattern:
      /\b(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{40,}\b/g,
    replace: () => REDACTED,
  },
];

// A cheap pre-test that must match a superset of every rule above.
// `ScrubbingLogger` puts this on every log line and every stack trace in the
// process, and an ordinary line matches none of the five rules — so it pays one
// pass to prove that rather than five.
const possiblySecret = new RegExp(
  `[A-Za-z0-9_-]{20,}|bearer\\s|(?:${secretParams})=`,
  "i",
);

/**
 * Replaces anything token-shaped in `text` with the redaction marker.
 *
 * A net, not a guarantee. The structural guarantee is that the token service
 * never returns a plaintext token to feature code in the first place; this
 * catches what escapes anyway.
 */
export function scrubText(text: string): string {
  if (!possiblySecret.test(text)) {
    return text;
  }

  let output = text;

  for (const rule of rules) {
    output = output.replace(rule.pattern, rule.replace as never);
  }

  return output;
}

/** Scrubs anything that might carry a token into a log or an error report. */
export function scrubUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubText(value);
  }

  if (value instanceof Error) {
    return scrubError(value);
  }

  return value;
}

/**
 * Returns an error whose message, stack and cause are scrubbed.
 *
 * A new Error rather than a mutation: the original may be held elsewhere, and
 * an error reporter that rewrote its caller's objects would be a worse bug than
 * the one it is preventing.
 */
export function scrubError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return scrubUnknown(error);
  }

  const scrubbed = new Error(scrubText(error.message));
  scrubbed.name = error.name;
  scrubbed.stack = error.stack ? scrubText(error.stack) : undefined;

  // `cause` is ES2022 and this package targets ES2021, so it is reached
  // through a cast rather than by widening the whole project's lib.
  const cause = (error as { cause?: unknown }).cause;

  if (cause !== undefined) {
    (scrubbed as { cause?: unknown }).cause = scrubError(cause);
  }

  return scrubbed;
}

/** An error's message, scrubbed, for a log line. Accepts anything thrown. */
export function scrubbedMessage(error: unknown): string {
  return scrubText(error instanceof Error ? error.message : String(error));
}
