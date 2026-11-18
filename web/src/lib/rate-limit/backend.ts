import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { captureServerError } from "../telemetry/server";
import { rateLimits, type RateLimitName } from "./limits";

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly resetAt: number };

export type RateLimitBackend = {
  limit: (
    name: RateLimitName,
    identifier: string,
  ) => Promise<RateLimitDecision>;
};

let redis: Redis | null | undefined;
const limiters = new Map<RateLimitName, Ratelimit>();
let testBackend: RateLimitBackend | undefined;

/**
 * Swap the Redis-backed limiter, so tests and the demo walkthrough can assert
 * allow/deny without standing up Upstash.
 *
 * Pass `undefined` to restore the real backend.
 */
export function setRateLimitBackend(
  backend: RateLimitBackend | undefined,
): void {
  testBackend = backend;
}

export const setRateLimitBackendForTests = setRateLimitBackend;

function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // Constructed from the two server-only variables, never from a NEXT_PUBLIC_
  // one: the REST token is a secret and must not ship to the browser.
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

function getLimiter(name: RateLimitName): Ratelimit | null {
  const client = getRedis();

  if (!client) {
    return null;
  }

  const existing = limiters.get(name);

  if (existing) {
    return existing;
  }

  const spec = rateLimits[name];
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(spec.limit, spec.window),
    prefix: `@contentual/ratelimit/${name}`,
    analytics: true,
  });

  limiters.set(name, limiter);
  return limiter;
}

/**
 * Ask the named limiter whether this identifier may proceed.
 *
 * Missing Redis configuration is a silent allow: local development and CI must
 * run every path without an Upstash credential, the same way an absent PostHog
 * key disables capture rather than failing the app. A Redis error is also an
 * allow — a limiter that threw would take the product down with it — and is
 * reported so the outage is visible.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitDecision> {
  if (testBackend) {
    return testBackend.limit(name, identifier);
  }

  const limiter = getLimiter(name);

  if (!limiter) {
    return { allowed: true };
  }

  try {
    const result = await limiter.limit(identifier);

    // Analytics flush runs in the background. Ignoring a rejection here is
    // the same contract as capture: the limiter has already answered, and a
    // failed telemetry write must not become a failed request.
    void result.pending.catch(() => undefined);

    if (result.success) {
      return { allowed: true };
    }

    return { allowed: false, resetAt: result.reset };
  } catch (error) {
    captureServerError(error, {
      operation: `rateLimit.${name}`,
      source: "rate-limit",
    });

    return { allowed: true };
  }
}
