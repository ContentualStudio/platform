import { Injectable, Logger } from "@nestjs/common";
import { PostHogClientProvider } from "./posthog-client.provider";
import type {
  ProductAnalytics,
  ProductEventInput,
} from "./product-analytics.port";
import { distinctIdFor } from "./product-events";
import { redactProperties } from "./redact";

/**
 * Captures product moments to PostHog, and swallows its own failures.
 *
 * Best-effort is the whole contract — see `ProductAnalytics`. Nothing on a
 * product path may fail because analytics did.
 *
 * Every property bag goes through `redactProperties`, so a secret cannot reach
 * PostHog because one call site was careless. That is deliberately enforced here
 * rather than trusted to callers.
 */
@Injectable()
export class PostHogProductAnalytics implements ProductAnalytics {
  private readonly logger = new Logger(PostHogProductAnalytics.name);

  constructor(private readonly posthog: PostHogClientProvider) {}

  capture(input: ProductEventInput): void {
    const client = this.posthog.client;

    // No credential means no client at all, rather than a client that fails on
    // every send.
    if (!client) {
      return;
    }

    try {
      client.capture({
        distinctId: distinctIdFor(input.identity),
        event: input.event,
        properties: redactProperties(input.properties),
        ...(input.uuid ? { uuid: input.uuid } : {}),
      });
    } catch (error) {
      this.logger.warn(
        `PostHog capture failed for ${input.event}: ${String(error)}`,
      );
    }
  }
}
