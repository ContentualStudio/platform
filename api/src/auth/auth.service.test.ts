import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Request as ExpressRequest } from "express";
import { AuthService } from "./auth.service";

test("Better Auth requests retain the configured public proxy path", () => {
  const config = {
    get(key: string) {
      return key === "auth.baseUrl"
        ? "https://web.example.com/api-proxy/api/auth"
        : undefined;
    },
  };
  const service = new AuthService(config as never, {} as never, {} as never);
  const request = {
    body: undefined,
    get: (name: string) => (name === "host" ? "api.example.com" : undefined),
    headers: { host: "api.example.com" },
    method: "GET",
    originalUrl: "/api/auth/callback/google?code=oauth-code",
    protocol: "https",
    url: "/callback/google?code=oauth-code",
  } as unknown as ExpressRequest;

  const webRequest = (
    service as unknown as {
      webRequestFromExpress(request: ExpressRequest): Request;
    }
  ).webRequestFromExpress(request);

  assert.equal(
    webRequest.url,
    "https://web.example.com/api-proxy/api/auth/callback/google?code=oauth-code",
  );
});

interface IntentInternals {
  assertIntentMatchesAccount(
    email: string,
    intent: "login" | "signup",
  ): Promise<void>;
  getPool(): Promise<{
    query(sql: string, values: unknown[]): Promise<{ rowCount: number }>;
  }>;
}

/** AuthService with its pool stubbed to report whether the account exists. */
function serviceWithAccount(exists: boolean) {
  const queries: { sql: string; values: unknown[] }[] = [];
  const service = new AuthService(
    { get: () => undefined } as never,
    {} as never,
    {} as never,
  );

  (service as unknown as IntentInternals).getPool = async () => ({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return { rowCount: exists ? 1 : 0 };
    },
  });

  return { queries, service: service as unknown as IntentInternals };
}

test("login intent is rejected when no account exists for the email", async () => {
  const { queries, service } = serviceWithAccount(false);

  await assert.rejects(
    () => service.assertIntentMatchesAccount("New.User@Example.com", "login"),
    (error: { response?: { code?: string }; status?: number }) => {
      assert.equal(error.response?.code, "AUTH_ACCOUNT_NOT_FOUND");
      assert.equal(error.status, 404);
      return true;
    },
  );

  // The lookup has to be case-insensitive: Better Auth stores emails lowercased.
  assert.deepEqual(queries[0]?.values, ["new.user@example.com"]);
});

test("signup intent is rejected when an account already exists", async () => {
  const { service } = serviceWithAccount(true);

  await assert.rejects(
    () => service.assertIntentMatchesAccount("taken@example.com", "signup"),
    (error: { response?: { code?: string }; status?: number }) => {
      assert.equal(error.response?.code, "AUTH_ACCOUNT_EXISTS");
      assert.equal(error.status, 409);
      return true;
    },
  );
});

test("each intent passes against the account state it expects", async () => {
  await serviceWithAccount(true).service.assertIntentMatchesAccount(
    "member@example.com",
    "login",
  );
  await serviceWithAccount(false).service.assertIntentMatchesAccount(
    "new@example.com",
    "signup",
  );
});
