import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import {
  ADMIN_TOKEN_HEADER,
  ContentEngineAdminGuard,
} from "./content-engine-admin.guard";

function context(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guard(token?: string): ContentEngineAdminGuard {
  return new ContentEngineAdminGuard({
    get: () => token,
  } as unknown as ConfigService);
}

test("a matching token is admitted", () => {
  assert.equal(
    guard("secret").canActivate(context({ [ADMIN_TOKEN_HEADER]: "secret" })),
    true,
  );
});

/**
 * The failure mode that matters.
 *
 * These endpoints can fire effects for every user in the product, so a
 * misconfigured environment must mean "nothing works", never "anyone can". The
 * PostHog config takes the opposite default — no key, no capture — and the
 * difference is deliberate: a missing analytics key costs observability, a
 * missing admin key on a fail-open endpoint costs the product.
 */
test("an unset token closes the endpoint rather than opening it", () => {
  assert.throws(
    () => guard(undefined).canActivate(context({})),
    /admin token is required/,
  );

  // Not even a caller presenting an empty token — which is what an unset
  // client-side variable sends — gets through.
  assert.throws(
    () => guard(undefined).canActivate(context({ [ADMIN_TOKEN_HEADER]: "" })),
    /admin token is required/,
  );
});

for (const [name, headers] of [
  ["a missing header", {}],
  ["a wrong token", { [ADMIN_TOKEN_HEADER]: "wrong" }],
  ["a prefix of the token", { [ADMIN_TOKEN_HEADER]: "sec" }],
  ["the token plus a suffix", { [ADMIN_TOKEN_HEADER]: "secretx" }],
  // Express collapses a repeated header into an array; comparing that against
  // the string would coerce and could match.
  ["a repeated header", { [ADMIN_TOKEN_HEADER]: ["secret", "secret"] }],
] as const) {
  test(`${name} is rejected`, () => {
    assert.throws(
      () => guard("secret").canActivate(context(headers)),
      /admin token is required/,
    );
  });
}
