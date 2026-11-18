import * as assert from "node:assert/strict";
import { test } from "node:test";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { AdminAuthService, AdminIdentity } from "./admin-auth.service";
import { AdminSessionGuard, type AdminRequest } from "./admin-session.guard";

const admin: AdminIdentity = {
  id: "admin-1",
  email: "team@contentual.test",
  image: null,
  name: "Team",
};

function context(request: AdminRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function guard(session: AdminIdentity | null) {
  return new AdminSessionGuard({
    async getSession() {
      return session;
    },
  } as unknown as AdminAuthService);
}

test("an admin session is admitted and attached to the request", async () => {
  const request = {} as AdminRequest;

  assert.equal(await guard(admin).canActivate(context(request)), true);
  assert.deepEqual(request.admin, admin);
});

test("no admin session is a 401 with a stable code", async () => {
  const request = {} as AdminRequest;

  await assert.rejects(
    guard(null).canActivate(context(request)),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      (error.getResponse() as { code: string }).code === "ADMIN_SESSION_REQUIRED",
  );
  assert.equal(request.admin, undefined);
});
