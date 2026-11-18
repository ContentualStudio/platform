import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeMatchAudit1784880000000 } from "./migrations/1784880000000-ProgrammeMatchAudit";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// The stored assignment is immutable, so the version and leaf that produced it
// are the only way to explain a past match once the tree has moved on. These
// assertions pin both columns and their nullability: they must be nullable so
// rows completed before this migration stay valid, and no historical audit
// value may be invented for them.
//
// This file lives beside the migrations directory rather than inside it
// because the data source globs `migrations/*.ts` — a test file in there would
// be loaded as a migration by `migration:run`.
const auditColumns = ["matchAlgorithmVersion", "matchLeafId"];

test("up adds both audit columns to challenge_setup as nullable text", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ProgrammeMatchAudit1784880000000().up(runner);

  const combined = sql.join("\n");

  for (const column of auditColumns) {
    assert.ok(
      combined.includes(`"${column}" text`),
      `migration must add "${column}" as text`,
    );
  }

  assert.ok(combined.includes(`ALTER TABLE "challenge_setup"`));
  assert.equal(
    /NOT NULL|DEFAULT/.test(combined),
    false,
    "audit columns must stay nullable and undefaulted for already-completed rows",
  );
});

test("down removes both audit columns", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ProgrammeMatchAudit1784880000000().down(runner);

  const combined = sql.join("\n");

  for (const column of auditColumns) {
    assert.ok(
      combined.includes(`DROP COLUMN IF EXISTS "${column}"`),
      `down must drop "${column}"`,
    );
  }
});

test("the migration touches no table other than challenge_setup", async () => {
  const { runner, sql } = recordingQueryRunner();
  const migration = new ProgrammeMatchAudit1784880000000();

  await migration.up(runner);
  await migration.down(runner);

  for (const statement of sql) {
    assert.ok(
      statement.includes(`"challenge_setup"`),
      `unexpected table in: ${statement}`,
    );
  }
});
