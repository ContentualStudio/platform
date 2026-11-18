import { Global, Module } from "@nestjs/common";
import { PostHogErrorTracking } from "./error-tracking.service";
import { PostHogClientProvider } from "./posthog-client.provider";
import { PRODUCT_ANALYTICS } from "./product-analytics.port";
import { PostHogProductAnalytics } from "./product-analytics.service";
import { UnhandledExceptionFilter } from "./unhandled-exception.filter";

/**
 * The single observability layer: one PostHog client, product analytics on top
 * of it, and error tracking on top of it.
 *
 * `@Global()` because observability cuts across every feature. The alternative —
 * every feature module importing this one — would be a list that is wrong the
 * moment a module forgets to update it, and the failure mode is silence rather
 * than an error.
 *
 * The filter is provided rather than bound with `APP_FILTER` so `main.ts` can
 * register it explicitly. `APP_FILTER` would place it inside the DI-managed
 * filter chain, where `BaseExceptionFilter` does not receive the http adapter it
 * needs to delegate the response.
 */
@Global()
@Module({
  providers: [
    PostHogClientProvider,
    PostHogProductAnalytics,
    PostHogErrorTracking,
    UnhandledExceptionFilter,
    {
      provide: PRODUCT_ANALYTICS,
      useExisting: PostHogProductAnalytics,
    },
  ],
  exports: [
    PostHogClientProvider,
    PostHogErrorTracking,
    PRODUCT_ANALYTICS,
    UnhandledExceptionFilter,
  ],
})
export class ObservabilityModule {}
