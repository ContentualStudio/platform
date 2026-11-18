import { enforceRateLimit } from "./enforce";
import { rateLimits, type RateLimitName } from "./limits";

/**
 * The wrappers' one call into rate limiting.
 *
 * User-keyed limiters load the session cache only when they need it, so IP-keyed
 * auth limiting — and the wrapper tests that exercise it — never touch Better
 * Auth. The session module is ESM and cannot be `require`d from this test runner.
 */
export async function applyNamedRateLimit(options: {
  readonly name: RateLimitName;
  readonly operation: string;
  readonly source: "action" | "route";
  readonly headers: Headers;
}): Promise<void> {
  let userId: string | undefined;

  if (rateLimits[options.name].keyBy === "user") {
    const { userIdFromHeaders } = await import("./user");
    userId = await userIdFromHeaders(options.headers);
  }

  await enforceRateLimit({ ...options, userId });
}
