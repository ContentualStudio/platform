import type { RateLimitName } from "./limits";

export const defaultRateLimitMessage = "Too many requests. Try again shortly.";

/**
 * The copy a blocked caller sees.
 *
 * Auth and mutations get the generic "try again shortly". The analytics refresh
 * is once an hour, so "shortly" would be a lie — that refusal names the moment
 * the next refresh is allowed.
 */
export function rateLimitMessage(
  name: RateLimitName,
  resetAt: number,
): string {
  if (name === "analyticsRefresh") {
    return `You've already refreshed your analytics. Next refresh is available at ${new Date(resetAt).toISOString()}.`;
  }

  return defaultRateLimitMessage;
}
