import { rateLimits, type RateLimitName } from "./limits";

/**
 * The client IP as the incoming headers report it.
 *
 * `x-forwarded-for` is a chain: the left-most address is the original client,
 * and everything after it is a proxy this request already passed. Railway and
 * the web proxy both set this; `x-real-ip` is the fallback for setups that
 * only forward one hop.
 *
 * `unknown` is a real bucket, not a skip. A request with no IP still has to
 * count against something, or a misconfigured proxy would unmeter auth.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  return "unknown";
}

/**
 * The Redis key for this limiter and caller.
 *
 * Auth keys on IP because there is no user yet. Mutations and the analytics
 * refresh key on the authenticated user. When the session cookie cache has
 * expired — which it does, well before the session itself — a user-keyed
 * limiter falls back to IP so the write is still bounded rather than free.
 */
export function identifierFor(
  name: RateLimitName,
  input: { readonly ip: string; readonly userId?: string },
): string {
  if (rateLimits[name].keyBy === "user" && input.userId) {
    return `user:${input.userId}`;
  }

  return `ip:${input.ip}`;
}
