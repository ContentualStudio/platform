import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { applyNamedRateLimit } from "../rate-limit";
import type { RateLimitName } from "../rate-limit/limits";
import { captureServerError } from "../telemetry/server";
import { isNamedFailure, sharedFailureCodes } from "./result";

interface RouteHandlerDefinition<Input, Data> {
  /** Names the route in error reports, e.g. `health`. */
  readonly name: string;
  /** The shared Zod schema for the request body, from `src/schemas/`. */
  readonly input?: ZodType<Input>;
  /**
   * Named limiter from `lib/rate-limit`. Applied before the handler, so an
   * over-limit call never reaches the side effect. Omit for health and reads.
   */
  readonly rateLimit?: RateLimitName;
  /** The message returned when the route fails unexpectedly. */
  readonly failureMessage: string;
  readonly handler: (
    input: Input,
    request: Request,
  ) => Promise<Data | Response> | Data | Response;
}

/**
 * Wraps a Route Handler so every one behaves the same way.
 *
 * The Server Action contract (`defineServerAction`) expressed over HTTP: the same
 * shared Zod schemas, the same `{ code, message }` failure body the api already
 * returns and the web client already parses, and the same rule that an
 * unanticipated throw is reported rather than swallowed.
 *
 * Status codes follow that split — 400 for input the caller got wrong, 429 for
 * a named limiter refusal, 500 for a bug here — so a caller can tell "you asked
 * wrongly" from "we broke" without reading the body.
 */
export function defineRouteHandler<Data, Input = void>(
  definition: RouteHandlerDefinition<Input, Data>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    try {
      if (definition.rateLimit) {
        await applyNamedRateLimit({
          name: definition.rateLimit,
          operation: definition.name,
          source: "route",
          headers: request.headers,
        });
      }

      let parsed = undefined as Input;

      if (definition.input) {
        // A body that is absent or not JSON is the caller's mistake, and is
        // answered as one rather than throwing out of the handler.
        const body = await request.json().catch(() => undefined);
        const result = definition.input.safeParse(body);

        if (!result.success) {
          return NextResponse.json(
            {
              code: sharedFailureCodes.invalidInput,
              message: definition.failureMessage,
            },
            { status: 400 },
          );
        }

        parsed = result.data;
      }

      const result = await definition.handler(parsed, request);

      // A handler that already built the HTTP response — typically to forward
      // upstream Set-Cookie — is returned as-is rather than re-serialised.
      if (result instanceof Response) {
        return result instanceof NextResponse
          ? result
          : new NextResponse(result.body, result);
      }

      return NextResponse.json(result);
    } catch (error) {
      if (isNamedFailure(error)) {
        return namedFailureResponse(error);
      }

      captureServerError(error, {
        operation: definition.name,
        source: "route",
      });

      // The thrown value never reaches the response: it can carry an upstream
      // body or a stack, and a 500 body is the least controlled place either
      // could end up.
      return NextResponse.json(
        {
          code: sharedFailureCodes.unexpected,
          message: definition.failureMessage,
        },
        { status: 500 },
      );
    }
  };
}

function namedFailureResponse(error: {
  readonly code: string;
  readonly message: string;
  readonly retryAfterMs?: number;
}): NextResponse {
  const status = error.code === sharedFailureCodes.rateLimited ? 429 : 400;
  const retryAfterSeconds =
    error.retryAfterMs === undefined
      ? undefined
      : String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)));

  return NextResponse.json(
    { code: error.code, message: error.message },
    {
      status,
      headers: retryAfterSeconds
        ? { "Retry-After": retryAfterSeconds }
        : undefined,
    },
  );
}
