import type { Request } from "express";

/**
 * The caller's address for per-client limits.
 *
 * Behind Railway's proxy (and the web's same-origin route handlers) the
 * socket address is a proxy's, so the left-most `x-forwarded-for` entry —
 * the original client — is what distinguishes callers. It is client-supplied
 * and therefore spoofable: fine for courtesy limits, never for authorisation.
 * Read the same way as the web's `clientIpFromHeaders`, so a client lands in
 * the same bucket on both sides.
 *
 * `unknown` is a real bucket, not a skip: a request with no address still
 * counts against something.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers["x-forwarded-for"];
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = chain?.split(",")[0]?.trim();

  return first || request.ip || "unknown";
}
