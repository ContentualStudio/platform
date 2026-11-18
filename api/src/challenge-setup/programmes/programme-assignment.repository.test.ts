import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ProgrammeMatchResult } from "./programme-matching.types";
import { ProgrammeAssignmentRepository } from "./programme-assignment.repository";

const result = {
  profile: { userType: "Independent Creator" },
  trace: {
    setupVersionId: "matching-v2",
    selectedRuleId: "rule-growth",
    selectedRuleName: "Growth route",
    selectedProgrammeKey: "growth",
    selectedProgrammeVersionId: "growth-pv-4",
    explanation: "The profile qualifies.",
    fallbackUsed: false,
    multipleRulesQualified: false,
    qualifyingRuleIds: ["rule-growth"],
    considered: [],
  },
} as unknown as ProgrammeMatchResult;

test("rematch closes the active row and records an auditable replacement", async () => {
  const active = { id: "assignment-old", userId: "user-1", active: true };
  let attempt: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> = {};
  let closed: Record<string, unknown> | null = null;

  const manager = {
    findOne: async (
      _entity: unknown,
      options: { where: Record<string, unknown> },
    ) => ("attemptId" in options.where ? attempt : active),
    create: (_entity: unknown, values: Record<string, unknown>) => values,
    save: async (entity: Record<string, unknown>) => {
      saved = entity;
      attempt = entity;
      return entity;
    },
    createQueryBuilder: () => {
      const builder = {
        update: () => builder,
        set: (values: Record<string, unknown>) => {
          closed = values;
          return builder;
        },
        where: () => builder,
        andWhere: () => builder,
        execute: async () => {
          active.active = false;
          return { affected: 1 };
        },
      };
      return builder;
    },
  };

  const replacement = await new ProgrammeAssignmentRepository().rematch(
    manager as never,
    {
      userId: "user-1",
      matchedAt: new Date("2026-08-27T12:00:00.000Z"),
      result,
      actor: "operator@example.com",
      reason: "Corrected the onboarding route.",
      attemptId: "rematch-001",
      supersededAt: new Date("2026-08-27T12:00:00.000Z"),
    },
  );

  assert.equal(replacement.created, true);
  assert.equal(active.active, false);
  assert.deepEqual(closed, {
    active: false,
    supersededAt: new Date("2026-08-27T12:00:00.000Z"),
    resetReason: "Corrected the onboarding route.",
    resetActor: "operator@example.com",
  });
  const savedRecord = saved;
  assert.equal(savedRecord.attemptId, "rematch-001");
  assert.equal(savedRecord.attemptActor, "operator@example.com");
  assert.equal(savedRecord.attemptReason, "Corrected the onboarding route.");
  assert.equal(savedRecord.programmeVersionId, "growth-pv-4");
});

test("repeating an attempt id is idempotent and does not close another row", async () => {
  const existing = { id: "assignment-replacement", attemptId: "rematch-001" };
  let queryBuilderCalls = 0;
  const manager = {
    findOne: async () => existing,
    createQueryBuilder: () => {
      queryBuilderCalls += 1;
      throw new Error("the idempotent path must not update the active row");
    },
  };

  const response = await new ProgrammeAssignmentRepository().rematch(
    manager as never,
    {
      userId: "user-1",
      matchedAt: new Date(),
      result,
      actor: "operator@example.com",
      reason: "retry",
      attemptId: "rematch-001",
      supersededAt: new Date(),
    },
  );

  assert.equal(response.created, false);
  assert.equal(response.assignment, existing);
  assert.equal(queryBuilderCalls, 0);
});

test("supersedeActiveIfPresent closes an active row when one exists", async () => {
  const active = { id: "assignment-old", userId: "user-1", active: true };
  let closed: Record<string, unknown> | null = null;

  const manager = {
    findOne: async () => active,
    createQueryBuilder: () => {
      const builder = {
        update: () => builder,
        set: (values: Record<string, unknown>) => {
          closed = values;
          return builder;
        },
        where: () => builder,
        andWhere: () => builder,
        execute: async () => {
          active.active = false;
          return { affected: 1 };
        },
      };
      return builder;
    },
  };

  await new ProgrammeAssignmentRepository().supersedeActiveIfPresent(
    manager as never,
    {
      userId: "user-1",
      supersededAt: new Date("2026-08-27T12:00:00.000Z"),
      actor: "user:user-1",
      reason: "superseded by questionnaire completion",
    },
  );

  assert.equal(active.active, false);
  assert.deepEqual(closed, {
    active: false,
    supersededAt: new Date("2026-08-27T12:00:00.000Z"),
    resetReason: "superseded by questionnaire completion",
    resetActor: "user:user-1",
  });
});

test("supersedeActiveIfPresent is a no-op when nothing is active", async () => {
  let queryBuilderCalls = 0;
  const manager = {
    findOne: async () => null,
    createQueryBuilder: () => {
      queryBuilderCalls += 1;
      throw new Error("must not update when no active assignment exists");
    },
  };

  await new ProgrammeAssignmentRepository().supersedeActiveIfPresent(
    manager as never,
    {
      userId: "user-1",
      supersededAt: new Date(),
      actor: "user:user-1",
      reason: "superseded by questionnaire completion",
    },
  );

  assert.equal(queryBuilderCalls, 0);
});

test("resolveInitialAttemptId reuses the canonical id when no row exists", async () => {
  const manager = {
    findOne: async () => null,
  };

  const attemptId = await new ProgrammeAssignmentRepository().resolveInitialAttemptId(
    manager as never,
    "user-1",
  );

  assert.equal(attemptId, "initial:user-1");
});

test("resolveInitialAttemptId suffixes a retry when the canonical row exists", async () => {
  const manager = {
    findOne: async () => ({ attemptId: "initial:user-1" }),
  };

  const attemptId = await new ProgrammeAssignmentRepository().resolveInitialAttemptId(
    manager as never,
    "user-1",
  );

  assert.match(attemptId, /^initial:user-1:retry:\d+$/);
});
