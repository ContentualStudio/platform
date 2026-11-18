import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ProgrammeTaskController } from "./programme-task.controller";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

test("the normal task list route resolves content from the authenticated user", async () => {
  let received: AuthenticatedUser | undefined;
  const service = {
    listTasks: async (candidate: AuthenticatedUser) => {
      received = candidate;
      return [{ id: "assigned-task" }];
    },
  };
  const controller = new ProgrammeTaskController(
    service as never,
    {} as never,
  );

  const result = await controller.list(user);

  assert.equal(received, user);
  assert.deepEqual(result, [{ id: "assigned-task" }]);
});

test("the week-ahead routes resolve from the authenticated user", async () => {
  const calls: unknown[] = [];
  const upcoming = {
    listUpcoming: async (candidate: AuthenticatedUser) => {
      calls.push(candidate);
      return { hasActiveProgramme: true, days: [] };
    },
    findUpcomingDay: async (candidate: AuthenticatedUser, dayNumber: number) => {
      calls.push([candidate, dayNumber]);
      return { id: "task-4" };
    },
  };
  const controller = new ProgrammeTaskController({} as never, upcoming as never);

  const list = await controller.upcoming(user);
  const preview = await controller.upcomingDay(user, 4);

  assert.deepEqual(calls, [user, [user, 4]]);
  assert.deepEqual(list, { hasActiveProgramme: true, days: [] });
  assert.deepEqual(preview, { id: "task-4" });
});
