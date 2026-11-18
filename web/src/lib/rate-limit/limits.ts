/**
 * The named rate limits this app enforces.
 *
 * Feature code never restates a window or a count. It names one of these and
 * the wrappers apply it, so a change here is a change everywhere that category
 * is used — and a new endpoint cannot invent a one-off limit of its own.
 *
 * `window` is the Upstash duration string; `windowMs` is the same value in
 * milliseconds, kept next to it so tests and retry-after math do not have to
 * parse the string.
 */
export const rateLimitNames = ["auth", "mutation", "analyticsRefresh"] as const;

export type RateLimitName = (typeof rateLimitNames)[number];

export type RateLimitKeyBy = "ip" | "user";

export interface RateLimitSpec {
  readonly limit: number;
  readonly window: `${number} ${"s" | "m" | "h"}`;
  readonly windowMs: number;
  readonly keyBy: RateLimitKeyBy;
}

export const rateLimits = {
  /** Sending and verifying login codes. */
  auth: {
    limit: 10,
    window: "1 m",
    windowMs: 60_000,
    keyBy: "ip",
  },
  /** Authenticated writes: preferences, challenge setup, and the like. */
  mutation: {
    limit: 60,
    window: "1 m",
    windowMs: 60_000,
    keyBy: "user",
  },
  /**
   * The user-triggered Instagram analytics refresh. Apply this name on that
   * action when it lands; do not declare a second hourly limiter for it.
   */
  analyticsRefresh: {
    limit: 1,
    window: "1 h",
    windowMs: 60 * 60_000,
    keyBy: "user",
  },
} as const satisfies Record<RateLimitName, RateLimitSpec>;
