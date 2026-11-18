import { PostHog } from "posthog-node";
import { posthogHost, posthogKey } from "./config";

/**
 * The one server-side PostHog client for the web app.
 *
 * Server capture is the reliable path: it does not run in a browser, so no ad or
 * tracking blocker can drop it. Everything that must not be lost — unexpected
 * errors above all — goes through here rather than through `posthog-js`.
 *
 * `flushAt: 1` / `flushInterval: 0` sends immediately instead of batching. The
 * client is module-scoped and there is no shutdown hook in a Next.js server to
 * flush a queue from, so a batched event would simply be lost whenever the
 * process was replaced — which, on a platform that restarts on every deploy, is
 * exactly when errors are most interesting.
 */
const client = posthogKey
  ? new PostHog(posthogKey, {
      host: posthogHost,
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

/**
 * Where a failure happened, in terms a diagnosis can start from.
 *
 * A fixed, narrow shape rather than a free-form bag — and that is the privacy
 * control. Nothing here can carry a request body, a header, a cookie or a form
 * input, so no call site can leak one by accident. There is deliberately no
 * general-purpose redactor on this side: every property this app sends is
 * constructed by the modules in this directory, not by feature code.
 */
export interface ServerErrorContext {
  /** The operation that failed, e.g. `completeStage2Action`. */
  readonly operation: string;
  /** Where Next.js caught it: a Server Action, a Route Handler, a render. */
  readonly source?: string;
  /** Route template where Next.js provides one, never the resolved path. */
  readonly route?: string;
  readonly method?: string;
  /** Next.js's error digest, which is what the user is shown and can quote. */
  readonly digest?: string;
  readonly userId?: string;
}

// A failure with no session behind it still has to land somewhere findable
// rather than being scattered across invented ids that resolve to no person.
export const ANONYMOUS_ERROR_DISTINCT_ID = "web-anonymous";

/**
 * Reports an unexpected failure, and swallows its own failures.
 *
 * Best-effort throughout: this runs on the error path, and a reporter that threw
 * would replace a diagnosable failure with an undiagnosable one.
 *
 * `$ip: null` suppresses geoip. Server-side capture would otherwise be
 * geolocated from the server's own address: personal data this product does not
 * need, and misleading besides.
 */
export function captureServerError(
  error: unknown,
  context: ServerErrorContext,
): void {
  if (!client) {
    return;
  }

  try {
    client.captureException(
      error,
      context.userId ?? ANONYMOUS_ERROR_DISTINCT_ID,
      { ...context, $ip: null },
    );
  } catch {
    // Nothing useful to do: the reporting channel is the thing that failed.
  }
}

/**
 * Where a server-side product event happened, in the same closed shape as
 * error context: operation, source, limiter name. Not a free-form bag — the
 * identifier that was limited (an IP or a user id) is deliberately absent, so
 * a spike in blocked requests is visible without putting client IPs on the
 * analytics pipeline.
 */
export interface ServerEventContext {
  readonly operation: string;
  readonly source?: string;
  readonly limiter?: string;
  readonly userId?: string;
}

/**
 * Reports a server-side product event, and swallows its own failures.
 *
 * Used for things that are working as designed — a rate-limit refusal above
 * all — so they show up as events to query, not as exceptions to page on.
 * `$ip: null` for the same reason as errors: this process's address is not
 * the user's, and is not useful.
 */
export function captureServerEvent(
  event: string,
  context: ServerEventContext,
): void {
  if (!client) {
    return;
  }

  try {
    client.capture({
      distinctId: context.userId ?? ANONYMOUS_ERROR_DISTINCT_ID,
      event,
      properties: { ...context, $ip: null },
    });
  } catch {
    // Nothing useful to do: the reporting channel is the thing that failed.
  }
}
