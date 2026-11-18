import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { PostHogErrorTracking } from "./error-tracking.service";

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

// Below this, the status describes the caller, not a failure: a 401, a 404 or a
// validation 400 is this api working correctly and saying no. Capturing them
// would bury the failures that matter under ordinary traffic.
export const minStatusToCapture = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Reports unexpected failures, then hands the response back to Nest unchanged.
 *
 * Extending `BaseExceptionFilter` and delegating to `super.catch` is the whole
 * design. The web app reads structured `{ code, message }` bodies off
 * `BadRequestException` and friends, so a filter that built its own response
 * would silently change every error contract in the product. This one only
 * observes.
 *
 * A thrown value that is not an `HttpException` is always captured: it means a
 * bug reached the transport layer, which is exactly what this exists to surface.
 */
@Catch()
export class UnhandledExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly errorTracking: PostHogErrorTracking) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // Capture is attempted before responding, so a client that disconnects
    // mid-response cannot cost us the report.
    this.report(exception, host);

    this.respond(exception, host);
  }

  // The delegation, named so a test can observe that it always happens without
  // standing up an http server. Overriding `catch` itself in a test would mean
  // testing something other than the filter.
  protected respond(exception: unknown, host: ArgumentsHost): void {
    super.catch(exception, host);
  }

  private report(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") {
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status < minStatusToCapture) {
      return;
    }

    const request = host.switchToHttp().getRequest<AuthenticatedRequest>();

    // The route template, not the resolved url: `/profile/:id` groups every
    // failure of one handler together, while the resolved path scatters them one
    // per user and puts an id into the analytics payload.
    const route = request?.route?.path ?? undefined;
    const method = request?.method;

    this.errorTracking.captureException(exception, {
      operation: [method, route].filter(Boolean).join(" ") || "unknown",
      route,
      method,
      statusCode: status,
      userId: request?.user?.id,
    });
  }
}
