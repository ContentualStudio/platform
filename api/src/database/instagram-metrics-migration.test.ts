import * as assert from "node:assert/strict";
import { test } from "node:test";
import { InstagramMetrics1784900000000 } from "./migrations/1784900000000-InstagramMetrics";
import { recordingQueryRunner } from "./testing/recording-query-runner";

// These tables are what the growth graph, the weekly card and the top-posts
// view are eventually drawn from, so their day-uniqueness and their
// nullability are pinned here: both are load-bearing and neither is obvious
// from the column list alone.
async function migrationSql(): Promise<string> {
  const { runner, sql } = recordingQueryRunner();

  await new InstagramMetrics1784900000000().up(runner);

  return sql.join("\n");
}

test("up creates the account and post metric tables", async () => {
  const combined = await migrationSql();

  for (const fragment of [
    `"instagram_account_metric"`,
    `"followerCount" integer NOT NULL`,
    `CHK_instagram_account_metric_nonneg`,
    `FK_instagram_account_metric_user`,
    `"instagram_post_metric"`,
    `"mediaId" text NOT NULL`,
    `CHK_instagram_post_metric_nonneg`,
    `IDX_instagram_post_metric_recent`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

// One authoritative reading per day. Meta revises numbers for up to 48 hours,
// so a same-day re-pull corrects the row rather than adding a second one.
test("both tables are unique per user and local day", async () => {
  const combined = await migrationSql();

  assert.ok(
    combined.includes(`ON "instagram_account_metric" ("userId", "localDate")`),
  );
  assert.ok(
    combined.includes(
      `ON "instagram_post_metric" ("userId", "mediaId", "localDate")`,
    ),
  );
});

// A metric Meta did not return must stay absent. A NOT NULL column would force
// a zero, which reads as "nobody saw this" — a different claim entirely.
test("every metric column is nullable so absence survives", async () => {
  const combined = await migrationSql();

  for (const column of [
    `"reach" integer,`,
    `"totalInteractions" integer,`,
    `"views" integer,`,
    `"saved" integer,`,
  ]) {
    assert.ok(combined.includes(column), `${column} must stay nullable`);
  }
});

test("follower_snapshot is left alone", async () => {
  // Its upsert already moves `recordedAt` to now(), so the day-keyed row
  // already says when the reading was taken.
  assert.ok(!(await migrationSql()).includes(`ALTER TABLE "follower_snapshot"`));
});

test("down removes both tables", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new InstagramMetrics1784900000000().down(runner);

  const combined = sql.join("\n");

  assert.ok(combined.includes(`DROP TABLE IF EXISTS "instagram_post_metric"`));
  assert.ok(combined.includes(`DROP TABLE IF EXISTS "instagram_account_metric"`));
});
