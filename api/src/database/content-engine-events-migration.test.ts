import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ContentEngineEvents1784690000000 } from "./migrations/1784690000000-ContentEngineEvents";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// The outbox is the durability guarantee for every Content Engine event: a fact
// commits with its event or neither commits. These assertions pin the column
// set, the claim/lease fields the dispatcher fences on, and the two indexes the
// pending sweep depends on, so a later hand-edit or a `migration:generate` run
// cannot quietly drop one. The real schema is exercised against Postgres in
// content-engine/programme-start-event.integration.test.ts; this file is the
// cheap check that runs with no database.
const requiredFragments = [
  `CREATE TABLE`,
  `"content_engine_events"`,
  `"id" text PRIMARY KEY`,
  `"eventName" text NOT NULL`,
  `"userId" text NOT NULL`,
  `"payload" jsonb NOT NULL`,
  `"status" text NOT NULL DEFAULT 'pending'`,
  `"attemptCount" integer NOT NULL DEFAULT 0`,
  `"availableAt" TIMESTAMP WITH TIME ZONE`,
  `"claimToken" uuid`,
  `"claimedUntil" TIMESTAMP WITH TIME ZONE`,
  `"lastError" text`,
  `"createdAt" TIMESTAMP WITH TIME ZONE`,
  `"deliveredAt" TIMESTAMP WITH TIME ZONE`,
  `"IDX_content_engine_events_pending"`,
  `"IDX_content_engine_events_name_created"`,
];

test("up creates the outbox table, claim fields, and dispatch indexes", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ContentEngineEvents1784690000000().up(runner);

  const combined = sql.join("\n");

  for (const fragment of requiredFragments) {
    assert.ok(
      combined.includes(fragment),
      `migration must create ${fragment}`,
    );
  }
});

test("up constrains status without restating the event vocabulary", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ContentEngineEvents1784690000000().up(runner);

  const combined = sql.join("\n");

  assert.ok(
    combined.includes(`CHECK ("status" IN ('pending', 'delivered'))`),
    "status must be constrained to the two lifecycle states",
  );

  // The twelve event tokens are owned by @contentual/content-engine-vocabulary.
  // A CHECK constraint copying them here would mean every new event needs a
  // migration, and the copy would drift. Comments may name an event as an
  // example; only an executable constraint on "eventName" is forbidden.
  const statements = combined.replace(/--[^\n]*/g, "");
  assert.equal(
    /CHECK\s*\([^)]*"eventName"/.test(statements),
    false,
    "the migration must not constrain eventName against restated tokens",
  );
});

test("down drops only the outbox table", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ContentEngineEvents1784690000000().down(runner);

  assert.equal(sql.length, 1);
  assert.ok(sql[0].includes(`DROP TABLE`));
  assert.ok(sql[0].includes(`"content_engine_events"`));
});
