import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import {
  PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER,
  ProgrammeMatchingAdminGuard,
  type ProgrammeMatchingAdminRequest,
} from "./programme-matching-admin.guard";

function context(request: ProgrammeMatchingAdminRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(token?: string, actor?: string): ProgrammeMatchingAdminGuard {
  return new ProgrammeMatchingAdminGuard({
    get: (key: string) =>
      key === "programmeMatchingAdmin.token" ? token : actor,
  } as unknown as ConfigService);
}

test("the credential supplies its authenticated audit identity", () => {
  const request = {
    headers: { [PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER]: "secret" },
  } as unknown as ProgrammeMatchingAdminRequest;

  assert.equal(guard("secret", "cms:matching-operator").canActivate(context(request)), true);
  assert.equal(request.programmeMatchingActor, "cms:matching-operator");
});

test("an actor is required server-side even when the token matches", () => {
  const request = {
    headers: { [PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER]: "secret" },
  } as unknown as ProgrammeMatchingAdminRequest;

  assert.throws(() => guard("secret").canActivate(context(request)));
});

test("a caller-supplied actor is ignored", () => {
  const request = {
    headers: {
      [PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER]: "secret",
      "x-operator-actor": "spoofed",
    },
  } as unknown as ProgrammeMatchingAdminRequest;

  guard("secret", "cms:matching-operator").canActivate(context(request));
  assert.equal(request.programmeMatchingActor, "cms:matching-operator");
});
