import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertProgrammeVersionEligible,
  lockProgrammeMatchingPublication,
} from "./programme-matching-publication-lock";

test("assignment takes the same advisory lock as CMS publication", async () => {
  const calls: { parameters?: unknown[]; sql: string }[] = [];
  await lockProgrammeMatchingPublication({
    query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return [];
    },
  });

  assert.match(calls[0]?.sql ?? "", /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.deepEqual(calls[0]?.parameters, ["programme-matching-publication"]);
});

test("assignment rejects a version whose source programme is ineligible", async () => {
  await assert.rejects(
    assertProgrammeVersionEligible(
      { query: async () => [] },
      "programme-version-1",
    ),
    /not eligible/i,
  );
});

test("assignment accepts an eligible programme version", async () => {
  await assert.doesNotReject(
    assertProgrammeVersionEligible(
      { query: async () => [{ eligible: true }] },
      "programme-version-1",
    ),
  );
});
