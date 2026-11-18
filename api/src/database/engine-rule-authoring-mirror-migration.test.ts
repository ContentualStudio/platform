import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryRunner } from "typeorm";
import { EngineRuleAuthoringMirror1784680000000 } from "./migrations/1784680000000-EngineRuleAuthoringMirror";

test("refuses to replace a non-empty legacy engine_rules mirror", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (statement: string) => {
      statements.push(statement);
      return /COUNT\(\*\)/.test(statement) ? [{ count: "1" }] : [];
    },
  } as unknown as QueryRunner;

  await assert.rejects(
    () => new EngineRuleAuthoringMirror1784680000000().up(queryRunner),
    /engine_rules contains 1 legacy row/,
  );

  assert.equal(statements.length, 1, "migration must stop before changing data");
  assert.doesNotMatch(statements[0], /DELETE|ALTER|DROP/i);
});
