import assert from "node:assert/strict";
import test from "node:test";
import type { ProgrammeTarget } from "./matching-authoring";
import { assertProgrammeTargetsEligible } from "./programme-version-publish";

test("publication rejects a target that left the live lifecycle", async () => {
  const target = {
    sourceDocumentId: "programme-1",
  } as ProgrammeTarget;

  await assert.rejects(
    assertProgrammeTargetsEligible(
      { query: async () => ({ rows: [] }) },
      [target],
    ),
    /no longer live/i,
  );
});

test("publication accepts every distinct currently eligible target", async () => {
  const seen: unknown[][] = [];
  const target = {
    sourceDocumentId: "programme-1",
  } as ProgrammeTarget;

  await assertProgrammeTargetsEligible(
    {
      query: async (_sql: string, values?: unknown[]) => {
        seen.push(values ?? []);
        return { rows: [{ exists: true }] };
      },
    },
    [target, target],
  );

  assert.deepEqual(seen, [["programme-1"]]);
});
