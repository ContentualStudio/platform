import { Injectable, Logger } from "@nestjs/common";
import { PostHogClientProvider } from "./posthog-client.provider";
import { redactProperties } from "./redact";
import { scrubError } from "./scrub-secrets";

/**
 * Where an unexpected failure happened, in terms a diagnosis can start from.
 *
 * Deliberately a fixed, narrow shape rather than a free-form bag. Anything not
 * named here — headers, cookies, request bodies, query strings — is not sent,
 * because request data is exactly where credentials and personal data live and
 * an analytics pipeline is the wrong place for either.
 */
export interface ErrorContext {
  /** The operation that failed, e.g. `ProfileController.saveStage1`. */
  readonly operation: string;
  /** Route template where available, so errors group by route rather than by id. */
  readonly route?: string;
  readonly method?: string;
  readonly statusCode?: number;
  /** The authenticated user, when the failure happened inside a session. */
  readonly userId?: string;
}

// A failure with no session behind it still has to land somewhere. PostHog
// requires a distinct id, and bucketing anonymous failures under one operational
// identity keeps them findable instead of scattering them across invented ids
// that resolve to no person.
export const ANONYMOUS_ERROR_DISTINCT_ID = "server-anonymous";

/**
 * Reports unexpected failures to PostHog, and swallows its own failures.
 *
 * Best-effort for the same reason the product-analytics path is: this runs on the
 * error path, and an error reporter that threw would replace a diagnosable
 * failure with an undiagnosable one.
 *
 * Geoip resolution is suppressed with `$ip: null`. Server-side capture would
 * otherwise be geolocated from the api's own address, which is both personal
 * data this product does not need and, being the server's location, actively
 * misleading.
 */
@Injectable()
export class PostHogErrorTracking {
  private readonly logger = new Logger(PostHogErrorTracking.name);

  constructor(private readonly posthog: PostHogClientProvider) {}

  captureException(error: unknown, context: ErrorContext): void {
    const client = this.posthog.client;

    if (!client) {
      return;
    }

    try {
      // The message and stack are scrubbed too, not just the context: a failed
      // Graph call puts the request url — and with it any token that leaked
      // into a query string — straight into the error it throws.
      client.captureException(scrubError(error), context.userId ?? ANONYMOUS_ERROR_DISTINCT_ID, {
        ...redactProperties({ ...context }),
        $ip: null,
      });
    } catch (captureError) {
      this.logger.warn(
        `PostHog exception capture failed for ${context.operation}: ${String(captureError)}`,
      );
    }
  }
}
