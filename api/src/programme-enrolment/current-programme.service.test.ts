import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { CurrentProgrammeService } from "./current-programme.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

const programme = {
  id: "first-take",
  title: "First Take",
  description: "",
  durationLabel: "21 days",
  durationDays: 21,
};

function build(options: {
  enrolment?: Record<string, unknown> | null;
  programmeFound?: boolean;
}) {
  const lookups: string[] = [];
  const enrolments = {
    findActiveForUser: async () => options.enrolment ?? null,
  };
  const reader = {
    findProgrammeVersionWithIdentity: async (id: string) => {
      lookups.push(`version:${id}`);
      return options.programmeFound === false
        ? undefined
        : { programme, sourceDocumentId: "cms-programme-7" };
    },
    findProgrammeWithIdentity: async (slug: string) => {
      lookups.push(`slug:${slug}`);
      return options.programmeFound === false
        ? undefined
        : { programme, sourceDocumentId: "cms-programme-7" };
    },
  };

  return {
    lookups,
    service: new CurrentProgrammeService(
      enrolments as never,
      reader as never,
    ),
  };
}

const active = {
  id: "enrolment-1",
  programmeSlug: "first-take",
  programmeVersionId: "first-take-v1",
  assignmentId: "assignment-1",
  durationDays: 21,
  day1ScheduledFor: "2026-09-01",
  currentDay: 4,
  startedAt: new Date("2026-09-01T08:00:00.000Z"),
};

test("the current programme is the journey under way", async () => {
  const { service } = build({ enrolment: active });

  const current = await service.forUser(user);

  assert.equal(current?.slug, "first-take");
  assert.equal(current?.currentDay, 4);
  assert.equal(current?.durationDays, 21);
  assert.equal(current?.day1ScheduledFor, "2026-09-01");
  assert.equal(current?.programmeSourceId, "cms-programme-7");
});

test("a user between programmes has no current programme", async () => {
  // The state a completed programme leaves behind: the enrolment is closed,
  // so nothing is active and every surface falls to its empty state rather
  // than showing the finished programme.
  const { service } = build({ enrolment: null });

  assert.equal(await service.forUser(user), null);
});

test("the journey's own duration is used, not the programme's authored one", async () => {
  // A second programme must count from its own day 1 over its own length.
  const { service } = build({
    enrolment: { ...active, durationDays: 15, currentDay: 1 },
  });

  const current = await service.forUser(user);

  assert.equal(current?.durationDays, 15);
  assert.equal(current?.currentDay, 1);
});

test("content resolves against the pinned version, not the live slug", async () => {
  const { service, lookups } = build({ enrolment: active });

  await service.forUser(user);

  assert.deepEqual(lookups, ["version:first-take-v1"]);
});

test("a journey opened before versions existed resolves by slug", async () => {
  const { service, lookups } = build({
    enrolment: { ...active, programmeVersionId: null },
  });

  await service.forUser(user);

  assert.deepEqual(lookups, ["slug:first-take"]);
});

test("a journey whose content is gone reports no current programme rather than half-rendering", async () => {
  const { service } = build({ enrolment: active, programmeFound: false });

  assert.equal(await service.forUser(user), null);
});
