import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostHog } from "posthog-node";

/**
 * The subset of posthog-node this codebase uses.
 *
 * Depending on the shape rather than the class is what keeps every capture path
 * fakeable in tests without a network stub, and it is the contract the
 * `@Optional()` client seams in the services rely on.
 */
export interface PostHogCapture {
  capture(input: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    uuid?: string;
  }): void;
  // Used rather than hand-building an `$exception` event: turning a thrown value
  // into PostHog's `$exception_list` shape means parsing stack traces per
  // runtime, which the client already does correctly.
  captureException(
    error: unknown,
    distinctId?: string,
    additionalProperties?: Record<string, unknown>,
  ): void;
  shutdown(): Promise<void>;
}

// Nest cannot inject an interface, so the client is bound by symbol. Null is a
// legitimate injected value: it means "no credential, capture disabled".
export const POSTHOG_CLIENT = Symbol("POSTHOG_CLIENT");

/**
 * The one PostHog client for this process.
 *
 * Every capture path — product analytics, error tracking, rule-evaluation
 * observability — shares this instance. posthog-node batches captures and
 * flushes on a timer, so a second client would mean a second unflushed queue
 * and a second connection pool for no gain.
 *
 * A missing key yields a null client rather than a client that fails on every
 * send, so local and CI runs exercise the capture paths without a credential.
 */
@Injectable()
export class PostHogClientProvider implements OnApplicationShutdown {
  private readonly logger = new Logger(PostHogClientProvider.name);
  readonly client: PostHogCapture | null;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("posthog.apiKey");
    const host = configService.get<string>("posthog.host");

    this.client = apiKey ? new PostHog(apiKey, { host }) : null;
  }

  // A process that exits without flushing drops whatever is still queued, and
  // Railway sends SIGTERM on every deploy — exactly when a request or an
  // evaluation run is most likely to be mid-batch.
  //
  // This must be a Nest lifecycle method, not a plain shutdown(): Nest only
  // calls hooks it knows about, and only on a signal once main.ts has run
  // app.enableShutdownHooks().
  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client?.shutdown();
    } catch (error) {
      this.logger.warn(`PostHog shutdown failed: ${String(error)}`);
    }
  }
}
