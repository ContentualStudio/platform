import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PlatformConnections1784730000000 } from "./migrations/1784730000000-PlatformConnections";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// These three tables carry two of the Content Engine's emit gates, and until
// now had no test of their own. The partial unique index is the one that
// matters most: it is what makes platform.connected fire once per connection
// while still allowing a reconnect, and an accidental change to it would show
// up as duplicate events rather than as a failure.
async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();

  await new PlatformConnections1784730000000().up(runner);

  return sql.join("\n");
}

test("up creates the connection, snapshot and milestone tables", async () => {
  const combined = await migrationSql();

  for (const fragment of [
    `"platform_connection"`,
    `"connectionOrdinal" integer NOT NULL`,
    `CHK_platform_connection_ordinal`,
    `FK_platform_connection_user`,
    `"follower_snapshot"`,
    `"localDate" date NOT NULL`,
    `CHK_follower_snapshot_count`,
    `"follower_milestone"`,
    `CHK_follower_milestone_tier`,
    `"tier" IN (100, 1000, 10000)`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

// The platform.connected emit gate. Partial, so a disconnected row never blocks
// a reconnect; unique, so a live connection cannot be created twice.
test("at most one live connection per user and platform is enforced", async () => {
  const combined = await migrationSql();

  assert.ok(combined.includes(`UQ_platform_connection_active`));
  assert.ok(
    combined.includes(`ON "platform_connection" ("userId", "platform")`),
  );
  assert.ok(combined.includes(`WHERE "disconnectedAt" IS NULL`));
});

// The reconnect discriminator: without it, a reconnect would rebuild a stable
// event id that was already delivered and be dropped as a replay.
test("every connection and reconnect is separately addressable", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "platform_connection" ("userId", "platform", "connectionOrdinal")`,
    ),
  );
});

test("one authoritative follower reading per user, platform and day", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "follower_snapshot" ("userId", "platform", "localDate")`,
    ),
  );
});

// Deliberately (userId, tier) and not (userId, platform, tier): the vocabulary's
// follower.milestone payload has no platform field, so crossing 100 followers on
// two platforms must emit one event, not two.
test("a follower tier is crossed once per user, across all platforms", async () => {
  assert.ok(
    (await migrationSql()).includes(
      `ON "follower_milestone" ("userId", "tier")`,
    ),
  );
});
