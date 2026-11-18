import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from "@nestjs/common";
import type { ErrorContext } from "./error-tracking.service";
import { PostHogErrorTracking } from "./error-tracking.service";
import { UnhandledExceptionFilter } from "./unhandled-exception.filter";

interface Reported {
  error: unknown;
  context: ErrorContext;
}

// Nest's response generation needs a real http adapter, which this test has no
// business standing up. Overriding the named delegation seam keeps the test on
// classification and context while still proving the response is always handed
// back.
class ObservedFilter extends UnhandledExceptionFilter {
  responded = 0;

  protected respond(): void {
    this.responded += 1;
  }
}

function filterFor(
  request: Record<string, unknown> | undefined,
  hostType: "http" | "rpc" = "http",
) {
  const reported: Reported[] = [];
  const errorTracking = {
    captureException(error: unknown, context: ErrorContext) {
      reported.push({ error, context });
    },
  } as PostHogErrorTracking;

  const filter = new ObservedFilter(errorTracking);

  const host = {
    getType: () => hostType,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;

  return { filter, host, reported };
}

const request = {
  method: "POST",
  route: { path: "/profile/onboarding/stage1" },
  user: { id: "user-1" },
};

test("captures a plain thrown error as a server failure", () => {
  const { filter, host, reported } = filterFor(request);
  const failure = new Error("boom");

  filter.catch(failure, host);

  assert.equal(reported.length, 1);
  assert.equal(reported[0].error, failure);
  assert.equal(reported[0].context.statusCode, 500);
  assert.equal(reported[0].context.userId, "user-1");
  assert.equal(reported[0].context.route, "/profile/onboarding/stage1");
  assert.equal(reported[0].context.method, "POST");
  assert.equal(reported[0].context.operation, "POST /profile/onboarding/stage1");
});

test("captures a 5xx HttpException", () => {
  const { filter, host, reported } = filterFor(request);

  filter.catch(new InternalServerErrorException("upstream down"), host);

  assert.equal(reported.length, 1);
  assert.equal(reported[0].context.statusCode, 500);
});

// A 4xx is this api working correctly and saying no. Capturing them would bury
// the failures that matter under ordinary traffic.
test("ignores 4xx responses, which describe the caller rather than a failure", () => {
  for (const expected of [
    new BadRequestException({ code: "INVALID", message: "no" }),
    new UnauthorizedException({ code: "SESSION_REQUIRED", message: "no" }),
    new NotFoundException(),
  ]) {
    const { filter, host, reported } = filterFor(request);

    filter.catch(expected, host);

    assert.equal(reported.length, 0);
  }
});

// The web app reads structured { code, message } bodies off these exceptions, so
// the filter must never take over response generation.
test("always hands the response back to Nest", () => {
  const captured = filterFor(request);
  captured.filter.catch(new Error("boom"), captured.host);
  assert.equal(captured.filter.responded, 1);

  const ignored = filterFor(request);
  ignored.filter.catch(new NotFoundException(), ignored.host);
  assert.equal(ignored.filter.responded, 1);
});

test("an unauthenticated request reports no user", () => {
  const { filter, host, reported } = filterFor({
    method: "GET",
    route: { path: "/health" },
  });

  filter.catch(new Error("boom"), host);

  assert.equal(reported[0].context.userId, undefined);
});

test("a request without a route template still reports an operation", () => {
  const { filter, host, reported } = filterFor({ method: "GET" });

  filter.catch(new Error("boom"), host);

  assert.equal(reported[0].context.operation, "GET");
  assert.equal(reported[0].context.route, undefined);
});

test("a request Express never populated does not crash the error path", () => {
  const { filter, host, reported } = filterFor(undefined);

  filter.catch(new Error("boom"), host);

  assert.equal(reported[0].context.operation, "unknown");
});

// The context shape is fixed on purpose: request data is where credentials and
// personal data live.
test("captures no headers, cookies or bodies", () => {
  const { filter, host, reported } = filterFor({
    ...request,
    headers: { cookie: "session=abc", authorization: "Bearer t" },
    body: { code: "123456" },
    query: { token: "t" },
  });

  filter.catch(new Error("boom"), host);
  const serialised = JSON.stringify(reported[0].context);

  for (const leaked of ["cookie", "authorization", "session=abc", "123456", "Bearer"]) {
    assert.ok(
      !serialised.includes(leaked),
      `${leaked} must not reach the analytics pipeline`,
    );
  }
});

// Non-http transports have no request to describe, and this product has none —
// but the filter is global, so it must not assume otherwise.
test("skips capture for a non-http transport", () => {
  const { filter, host, reported } = filterFor(request, "rpc");

  filter.catch(new Error("boom"), host);

  assert.equal(reported.length, 0);
  assert.equal(filter.responded, 1);
});
