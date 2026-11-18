import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeMatchingAdminController } from "./programme-matching-admin.controller";
import type { ProgrammeMatchingAdminRequest } from "./programme-matching-admin.guard";

const request = {
  programmeMatchingActor: "cms:matching-operator",
} as ProgrammeMatchingAdminRequest;

test("rematch rejects a request without explicit destructive confirmation", async () => {
  const controller = new ProgrammeMatchingAdminController({
    rematch: async () => ({ created: true }),
  } as never);

  await assert.rejects(
    controller.rematch(
      "user-1",
      { attemptId: "attempt-1", reason: "Support-approved reset" },
      request,
    ),
    (error: { status?: number }) => error.status === 400,
  );
});

test("rematch accepts a literal confirmation and ignores no audit fields", async () => {
  let received: unknown;
  const controller = new ProgrammeMatchingAdminController({
    rematch: async (input: unknown) => {
      received = input;
      return { created: true };
    },
  } as never);

  await controller.rematch(
    "user-1",
    {
      attemptId: "attempt-1",
      reason: "Support-approved reset",
      confirmation: "REMATCH",
    },
    request,
  );

  assert.deepEqual(received, {
    userId: "user-1",
    actor: "cms:matching-operator",
    reason: "Support-approved reset",
    attemptId: "attempt-1",
  });
});
