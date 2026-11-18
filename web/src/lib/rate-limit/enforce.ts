import { captureServerEvent } from "../telemetry/server";
import { ActionFailure, sharedFailureCodes } from "../server/result";
import { checkRateLimit } from "./backend";
import { clientIpFromHeaders, identifierFor } from "./identifier";
import type { RateLimitName } from "./limits";
import { rateLimitMessage } from "./messages";

/**
 * Refuse this call if the named limiter says so.
 *
 * Thrown as `ActionFailure` so both wrappers treat it as a named answer, not a
 * bug: the caller gets the prepared message, PostHog gets a `rate_limit_exceeded`
 * event rather than an exception, and the handler never runs.
 *
 * `userId` is resolved by the caller. This module does not read the session
 * itself — that import is ESM-only and would make every wrapper test load
 * Better Auth under ts-node's CommonJS runner.
 */
export async function enforceRateLimit(options: {
  readonly name: RateLimitName;
  readonly operation: string;
  readonly source: "action" | "route";
  readonly headers: Headers;
  readonly userId?: string;
}): Promise<void> {
  const identifier = identifierFor(options.name, {
    ip: clientIpFromHeaders(options.headers),
    userId: options.userId,
  });
  const decision = await checkRateLimit(options.name, identifier);

  if (decision.allowed) {
    return;
  }

  captureServerEvent("rate_limit_exceeded", {
    operation: options.operation,
    source: options.source,
    limiter: options.name,
    userId: options.userId,
  });

  throw new ActionFailure(
    sharedFailureCodes.rateLimited,
    rateLimitMessage(options.name, decision.resetAt),
    Math.max(0, decision.resetAt - Date.now()),
  );
}
