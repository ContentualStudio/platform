import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AuthService } from "./auth/auth.service";
import { ScrubbingLogger } from "./observability/scrubbing-logger";
import { UnhandledExceptionFilter } from "./observability/unhandled-exception.filter";

async function bootstrap() {
  // Installed before anything else logs. Process-wide rather than injected,
  // because "no token ever reaches a log line" only means something if it holds
  // for the log calls nobody audited — Nest's own included.
  const app = await NestFactory.create(AppModule, {
    logger: new ScrubbingLogger(),
    // Stripe signs the exact bytes it sends; the webhook controller verifies
    // against `request.rawBody`, which only exists when this is on.
    rawBody: true,
  });
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const authService = app.get(AuthService);
  const express = app.getHttpAdapter().getInstance();

  // Registered here rather than through APP_FILTER: BaseExceptionFilter needs
  // the http adapter to delegate response generation, which it only has once
  // the application is created. The filter observes and rethrows, so every
  // existing error response is unchanged.
  app.useGlobalFilters(app.get(UnhandledExceptionFilter));

  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  express.use("/api/auth", (request, response) => {
    void authService.handleBetterAuthRequest(request, response);
  });

  // Without this, Nest never runs onApplicationShutdown/onModuleDestroy on a
  // process signal — and Railway stops a container with SIGTERM on every
  // deploy. The PostHog observer's queued events and the auth service's
  // teardown both depend on these hooks firing.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
