import { REDACTED, scrubText } from "./scrub-secrets";

export { REDACTED };

// Longest string kept on a property. Analytics properties are for slicing, not
// for storing bodies: a stack trace or a serialised payload that arrives here by
// accident is cut rather than shipped whole.
export const maxPropertyStringLength = 500;

// Depth beyond which nesting is dropped. A property tree this deep is a mistake
// at the call site, and following it would let a pathological object stall the
// request that is only trying to report on itself.
const maxDepth = 6;

/**
 * Keys redacted on an exact, case-insensitive match.
 *
 * Exact rather than substring because these words are too common as fragments:
 * substring-matching `code` would also redact `countryCode` and `statusCode`,
 * and once everything is redacted nobody trusts the redaction.
 */
const redactedExactKeys = new Set([
  "auth",
  "authorization",
  "code",
  "cookie",
  "credential",
  "credentials",
  "email",
  "key",
  "otp",
  "passcode",
  "password",
  "phone",
  "pin",
  "secret",
  "session",
  "token",
]);

/**
 * Fragments redacted anywhere in a key.
 *
 * Every one of these is unambiguous — a key containing `accessToken` or
 * `apiKey` has no innocent reading — so matching them as fragments catches the
 * camelCase and snake_case spellings without a list of every variant.
 */
const redactedKeyFragments = [
  "apikey",
  "api_key",
  "authorization",
  "bearer",
  "cookie",
  "credential",
  "logincode",
  "login_code",
  "passcode",
  "password",
  "passwd",
  "privatekey",
  "private_key",
  "secret",
  "token",
  "verificationcode",
  "verification_code",
];

function isRedactedKey(key: string): boolean {
  const normalised = key.toLowerCase();

  if (redactedExactKeys.has(normalised)) {
    return true;
  }

  return redactedKeyFragments.some((fragment) => normalised.includes(fragment));
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string": {
      // Key-based redaction cannot see a secret that arrived under an innocent
      // key — a token interpolated into a url or an error message. Scrubbing by
      // shape first is what closes that gap, and doing it here means it holds
      // for every capture path rather than for the call sites that remembered.
      const scrubbed = scrubText(value);

      return scrubbed.length > maxPropertyStringLength
        ? `${scrubbed.slice(0, maxPropertyStringLength)}…`
        : scrubbed;
    }
    case "number":
      // NaN and ±Infinity do not survive JSON, so they would reach PostHog as
      // null and read as "no value" rather than "bad value".
      return Number.isFinite(value) ? value : undefined;
    case "boolean":
      return value;
    // Functions, symbols, bigints and undefined are all dropped: none of them
    // survive the wire, and a caller passing one meant something else.
    default:
      break;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (depth >= maxDepth) {
    return undefined;
  }

  // A cycle would otherwise recurse until the stack gives out. Dropping the
  // repeat keeps the first occurrence, which is the one that carries meaning.
  if (seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => redactValue(entry, depth + 1, seen))
      .filter((entry) => entry !== undefined);
  }

  return redactRecord(value as Record<string, unknown>, depth + 1, seen);
}

function redactRecord(
  input: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (isRedactedKey(key)) {
      // The key is kept so that a leak at the call site is visible in PostHog
      // as a redaction rather than as an absent property nobody notices.
      output[key] = REDACTED;
      continue;
    }

    const redacted = redactValue(value, depth, seen);

    if (redacted !== undefined) {
      output[key] = redacted;
    }
  }

  return output;
}

/**
 * Strips secrets and unnecessary personal data out of analytics properties.
 *
 * This is structural on purpose. Every capture path runs properties through
 * here, so a login code, bearer token or session cookie cannot reach PostHog
 * because one call site forgot — the guarantee holds for call sites that do not
 * exist yet, which is the only version of it worth having.
 *
 * Redaction is by key, not by value: a value-sniffing heuristic would both miss
 * secrets that look ordinary and mangle legitimate data that happens to look
 * like a secret. Callers still owe the discipline of not putting a secret under
 * an innocent-looking key.
 */
export function redactProperties(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) {
    return {};
  }

  // The root goes into `seen` before the walk starts. Without it a property
  // pointing back at the root is only caught one level down, so the redacted
  // copy would carry a needless duplicate of the whole bag.
  const seen = new WeakSet<object>([input]);

  return redactRecord(input, 0, seen);
}
