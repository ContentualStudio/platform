import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProgrammeHasNoAssignments,
  assertProgrammeNotTargetedByActiveMatching,
  captureProgrammeOperation,
  programmeAvailabilityChange,
  programmeIsEligibleForMatching,
  preventAssignedProgrammeArchive,
  reconcileProgrammeEligibilityRows,
} from "./programme-lifecycle";

test("archive and delete are refused when assignment history depends on a programme", async () => {
  await assert.rejects(
    assertProgrammeHasNoAssignments(
      { query: async () => ({ rows: [{ exists: true }] }) },
      "programme-1",
    ),
    /assigned journey/,
  );
});

test("an unassigned programme can be archived or deleted", async () => {
  await assert.doesNotReject(
    assertProgrammeHasNoAssignments(
      { query: async () => ({ rows: [] }) },
      "programme-1",
    ),
  );
});

test("assignment dependency checks ignore superseded journeys", async () => {
  let statement = "";

  await assertProgrammeHasNoAssignments(
    {
      query: async (sql) => {
        statement = sql;
        return { rows: [] };
      },
    },
    "programme-1",
  );

  assert.match(statement, /assignment\."active" = true/);
});

test("programme lifecycle follows draft to live to retired to archived", async () => {
  await assert.doesNotReject(
    preventAssignedProgrammeArchive({
      data: { lifecycleStatus: "live" },
      originalDoc: { lifecycleStatus: "draft" },
    } as never),
  );

  await assert.rejects(
    preventAssignedProgrammeArchive({
      data: { lifecycleStatus: "draft" },
      originalDoc: { lifecycleStatus: "retired" },
    } as never),
    /cannot transition/i,
  );
});

test("eligibility changes are persisted as a fail-closed publication gate", async () => {
  const lifecycleModule = (await import("./programme-lifecycle")) as Record<
    string,
    unknown
  >;
  const update = lifecycleModule.updateProgrammeEligibility;

  assert.equal(typeof update, "function");

  const calls: { parameters?: unknown[]; sql: string }[] = [];
  await (
    update as (
      queryable: {
        query: (
          sql: string,
          parameters?: unknown[],
        ) => Promise<{ rows: unknown[] }>;
      },
      sourceDocumentId: string,
      lifecycleStatus: string,
      publicationStatus: string,
    ) => Promise<void>
  )(
    {
      query: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return { rows: [] };
      },
    },
    "programme-1",
    "retired",
    "published",
  );

  assert.match(calls[0]?.sql ?? "", /programme_matching_target_eligibility/);
  assert.deepEqual(calls[0]?.parameters, [
    "programme-1",
    "retired",
    "published",
    false,
  ]);
});

test("matching eligibility requires both live lifecycle and published status", () => {
  assert.equal(programmeIsEligibleForMatching("live", "published"), true);
  assert.equal(programmeIsEligibleForMatching("live", "draft"), false);
  assert.equal(programmeIsEligibleForMatching("retired", "published"), false);
});

test("unpublishing a live programme leaves matching eligibility", () => {
  assert.equal(
    programmeAvailabilityChange(
      { _status: "published", lifecycleStatus: "live" },
      { _status: "draft", lifecycleStatus: "live" },
      true,
    )?.leavingEligible,
    true,
  );
});

test("saving a draft over a published programme keeps the published target eligible", () => {
  const change = programmeAvailabilityChange(
    { _status: "published", lifecycleStatus: "live" },
    { _status: "draft", lifecycleStatus: "live" },
  );

  assert.equal(change?.leavingEligible, false);
  assert.equal(change?.publicationStatus, "published");
});

test("a Payload draft save does not run application-database lifecycle writes", async () => {
  const context: Record<string, unknown> = {};
  await captureProgrammeOperation({
    args: { draft: true },
    context,
  } as never);

  await assert.doesNotReject(
    preventAssignedProgrammeArchive({
      context,
      data: { _status: "draft", lifecycleStatus: "live" },
      originalDoc: {
        _status: "draft",
        id: "programme-1",
        lifecycleStatus: "live",
      },
    } as never),
  );
});

test("startup reconciliation repairs drift and closes deleted rows", async () => {
  const calls: { parameters?: unknown[]; sql: string }[] = [];
  await reconcileProgrammeEligibilityRows(
    {
      query: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return { rows: [] };
      },
    },
    [
      {
        _status: "published",
        id: "programme-1",
        lifecycleStatus: "live",
      },
      {
        _status: "published",
        id: "programme-2",
        lifecycleStatus: "retired",
      },
    ],
  );

  assert.deepEqual(calls[0]?.parameters, [
    "programme-1",
    "live",
    "published",
    true,
  ]);
  assert.deepEqual(calls[1]?.parameters, [
    "programme-2",
    "retired",
    "published",
    false,
  ]);
  assert.match(calls[2]?.sql ?? "", /"eligible" = false/);
  assert.deepEqual(calls[2]?.parameters, [["programme-1", "programme-2"]]);
});

test("a programme targeted by the active matching setup cannot leave live", async () => {
  await assert.rejects(
    assertProgrammeNotTargetedByActiveMatching(
      { query: async () => ({ rows: [{ exists: true }] }) },
      "programme-1",
    ),
    /active matching setup/,
  );
});

test("a programme outside active matching can leave live", async () => {
  await assert.doesNotReject(
    assertProgrammeNotTargetedByActiveMatching(
      { query: async () => ({ rows: [] }) },
      "programme-1",
    ),
  );
});
