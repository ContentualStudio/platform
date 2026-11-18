import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { BadgeCelebrationService } from "./badge-celebration.service";
import { GamificationController } from "./gamification.controller";

const user = { id: "user-1" } as AuthenticatedUser;

function controller(shown: boolean) {
  const calls: [string, string][] = [];
  const celebrations = {
    async listPending() {
      return [];
    },
    async markShown(userId: string, id: string) {
      calls.push([userId, id]);
      return shown;
    },
  } as unknown as BadgeCelebrationService;

  return {
    controller: new GamificationController(
      null as never,
      null as never,
      null as never,
      celebrations,
      null as never,
    ),
    calls,
  };
}

test("pending celebrations are wrapped for the client", async () => {
  assert.deepEqual(await controller(true).controller.pendingCelebrations(user), {
    celebrations: [],
  });
});

test("marking a celebration shown is scoped to the signed-in user", async () => {
  const { controller: subject, calls } = controller(true);

  assert.deepEqual(await subject.markCelebrationShown(user, "42"), { shown: true });
  assert.deepEqual(calls, [["user-1", "42"]]);
});

test("an unknown or foreign celebration is a 404 with a stable code", async () => {
  await assert.rejects(
    controller(false).controller.markCelebrationShown(user, "42"),
    (error: unknown) =>
      error instanceof NotFoundException &&
      (error.getResponse() as { code?: string }).code === "BADGE_CELEBRATION_NOT_FOUND",
  );
});
