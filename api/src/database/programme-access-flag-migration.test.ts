import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeAccessFlag1785050000000 } from "./migrations/1785050000000-ProgrammeAccessFlag";

function sqlFor(direction: "up" | "down") {
  const statements: string[] = [];
  const runner = {
    query: async (statement: string) => {
      statements.push(statement);
    },
  };

  return new ProgrammeAccessFlag1785050000000()
    [direction](runner as never)
    .then(() => statements.join("\n").replace(/\s+/g, " "));
}

test("up adds the access flag defaulted to open, so published programmes stay startable", async () => {
  const sql = await sqlFor("up");

  assert.ok(sql.includes(`ADD COLUMN "access" text NOT NULL DEFAULT 'open'`));
});

test("the vocabulary is gated to open and locked", async () => {
  const sql = await sqlFor("up");

  assert.ok(sql.includes("CHK_programme_access"));
  assert.ok(sql.includes(`'open'`));
  assert.ok(sql.includes(`'locked'`));
});

test("down drops the constraint before the column it references", async () => {
  const sql = await sqlFor("down");

  assert.ok(
    sql.indexOf("CHK_programme_access") <
      sql.indexOf(`DROP COLUMN IF EXISTS "access"`),
  );
});
