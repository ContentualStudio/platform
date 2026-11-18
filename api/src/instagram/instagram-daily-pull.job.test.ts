import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import {
  apiFailure,
  apiSuccess,
  type InsightsRange,
  type InstagramApiPort,
} from "./instagram-api.port";
import { InstagramDailyPullJob } from "./instagram-daily-pull.job";
import type { InstagramTokenService } from "./instagram-token.service";
import type { InstagramService } from "./instagram.service";
import { refreshEligibleAfterMs } from "./token-lifecycle";

const USER = "user-1";
const DATE = "2026-08-25";

interface Options {
  readonly dataConsent?: boolean;
  readonly status?: string;
  readonly connection?: null;
  readonly accountType?: "professional" | "personal";
  readonly tokenAgeMs?: number;
  readonly refreshFails?: "auth" | "transient";
  readonly accountFails?: "auth" | "transient";
  readonly insightsFail?: "permission" | "transient";
  readonly mediaFail?: "permission" | "transient";
  readonly timezone?: string | null;
}

function build(options: Options = {}) {
  const statements: { sql: string; params: readonly unknown[] }[] = [];
  const statusWrites: string[] = [];
  const syncs: string[] = [];
  const storedTokens: unknown[] = [];
  const insightRanges: (InsightsRange | undefined)[] = [];

  const issuedAt = new Date(Date.now() - (options.tokenAgeMs ?? 60_000));

  const tokens = {
    getConnection: async () =>
      options.connection === null
        ? null
        : {
            connectionId: "9",
            username: "creator",
            accountType: options.accountType ?? "professional",
            status: options.status ?? "connected",
            dataConsent: options.dataConsent ?? true,
            scopes: ["instagram_business_basic"],
          },
    readTimestamps: async () => ({
      issuedAt,
      expiresAt: new Date(Date.now() + 5_184_000_000),
      lastRefreshedAt: null,
      lastUsedAt: null,
    }),
    withAccessToken: async <T>(_id: string, work: (t: string) => Promise<T>) =>
      work("stored-token"),
    setStatus: async (_id: string, status: string) => {
      statusWrites.push(status);
      return true;
    },
    storeToken: async (input: unknown) => {
      storedTokens.push(input);
    },
  } as unknown as InstagramTokenService;

  const api = {
    refreshToken: async () =>
      options.refreshFails
        ? apiFailure(options.refreshFails, "refresh failed")
        : apiSuccess({ accessToken: "fresh", expiresInSeconds: 5_184_000 }),
    fetchAccount: async () =>
      options.accountFails
        ? apiFailure(options.accountFails, "account failed")
        : apiSuccess({
            externalAccountId: "ig-1",
            username: "creator",
            followerCount: 1200,
            accountType: options.accountType ?? "professional",
          }),
    fetchAccountInsights: async (
      _token: string,
      _accountId: string,
      range?: InsightsRange,
    ) => {
      insightRanges.push(range);
      return options.insightsFail
        ? apiFailure(options.insightsFail, "insights failed")
        : apiSuccess({
            reach: 640,
            totalInteractions: 96,
            profileLinksTaps: null,
            views: 1_500,
            profileViews: 30,
          });
    },
    fetchMediaWithInsights: async () =>
      options.mediaFail
        ? apiFailure(options.mediaFail, "media failed")
        : apiSuccess([
            {
              mediaId: "m1",
              mediaType: "REELS",
              permalink: null,
              postedAt: null,
              caption: "Behind the scenes",
              thumbnailUrl: "https://cdn.example/m1.jpg",
              views: 900,
              reach: 700,
              likes: 12,
              comments: 3,
              shares: null,
              saved: null,
            },
          ]),
  } as unknown as InstagramApiPort;

  const instagram = {
    syncFollowers: async (userId: string) => {
      syncs.push(userId);
      return { reachedTiers: [] };
    },
  } as unknown as InstagramService;

  const dataSource = {
    query: async (sql: string, params?: readonly unknown[]) => {
      statements.push({ sql, params: params ?? [] });
      if (sql.includes(`FROM "user_profile"`)) {
        return [{ timezone: "timezone" in options ? options.timezone : "Europe/London" }];
      }
      return [[], 1];
    },
  } as unknown as DataSource;

  return {
    job: new InstagramDailyPullJob(dataSource, tokens, instagram, api),
    statements,
    statusWrites,
    syncs,
    storedTokens,
    insightRanges,
  };
}

function accountMetric(statements: { sql: string; params: readonly unknown[] }[]) {
  return statements.find((entry) =>
    entry.sql.includes(`INSERT INTO "instagram_account_metric"`),
  );
}

test("a consented, connected user is pulled and their followers synced", async () => {
  const { job, statements, syncs } = build();

  assert.equal(await job.run(USER, DATE), "succeeded");
  assert.ok(accountMetric(statements));
  assert.deepEqual(syncs, [USER]);
});

// All three are ordinary states, not failures, and must not be retried.
test("withdrawn consent skips without touching anything", async () => {
  const { job, statements, syncs } = build({ dataConsent: false });

  assert.equal(await job.run(USER, DATE), "skipped");
  assert.equal(statements.length, 0);
  assert.equal(syncs.length, 0);
});

test("a connection needing reconnect is skipped", async () => {
  const { job, syncs } = build({ status: "reconnect_required" });

  assert.equal(await job.run(USER, DATE), "skipped");
  assert.equal(syncs.length, 0);
});

test("a user with no live connection is skipped", async () => {
  const { job, syncs } = build({ connection: null });

  assert.equal(await job.run(USER, DATE), "skipped");
  assert.equal(syncs.length, 0);
});

// Meta only accepts a refresh once the token is a day old.
test("a token younger than a day is reused rather than refreshed", async () => {
  const { job, storedTokens } = build({ tokenAgeMs: 60_000 });

  await job.run(USER, DATE);

  assert.equal(storedTokens.length, 0);
});

test("a token at least a day old is refreshed before the pull", async () => {
  const { job, storedTokens } = build({ tokenAgeMs: refreshEligibleAfterMs });

  await job.run(USER, DATE);

  assert.equal(storedTokens.length, 1);
});

test("a refresh refused as dead flags reconnect and stops the run", async () => {
  const { job, statusWrites, syncs } = build({
    tokenAgeMs: refreshEligibleAfterMs,
    refreshFails: "auth",
  });

  assert.equal(await job.run(USER, DATE), "skipped");
  assert.deepEqual(statusWrites, ["reconnect_required"]);
  assert.equal(syncs.length, 0);
});

// The existing token is still valid, so a flaky refresh must not cost the user
// their day's data.
test("a transient refresh failure still pulls with the existing token", async () => {
  const { job, statements } = build({
    tokenAgeMs: refreshEligibleAfterMs,
    refreshFails: "transient",
  });

  assert.equal(await job.run(USER, DATE), "succeeded");
  assert.ok(accountMetric(statements));
});

// A downgrade stops insights at the source, but the follower count is still
// readable and still worth storing.
test("an account downgraded to personal records, prompts and does not error", async () => {
  const { job, statements, statusWrites, syncs } = build({
    accountType: "personal",
  });

  assert.equal(await job.run(USER, DATE), "succeeded");
  assert.deepEqual(statusWrites, ["reconnect_required"]);
  assert.deepEqual(syncs, [USER]);

  const metric = accountMetric(statements);

  assert.ok(metric);
  assert.equal(metric.params[2], 1200, "the follower count is still stored");
  assert.equal(metric.params[3], null, "no professional-only metric is invented");
  assert.equal(metric.params[8], false, "the row records that insights were unavailable");

  assert.equal(
    statements.some((entry) =>
      entry.sql.includes(`INSERT INTO "instagram_post_metric"`),
    ),
    false,
  );
});

// Under 100 followers Meta refuses the gated metrics. That is a degradation,
// not a failure.
test("a gated insights refusal writes what is available and omits the rest", async () => {
  const { job, statements } = build({ insightsFail: "permission" });

  assert.equal(await job.run(USER, DATE), "succeeded");

  const metric = accountMetric(statements);

  assert.ok(metric);
  assert.equal(metric.params[2], 1200);
  assert.equal(metric.params[3], null);
  assert.equal(metric.params[8], false);
  // Nothing describes yesterday, so the row stays on the run's own day.
  assert.equal(metric.params[1], DATE);
});

test("account insights are read for the last completed local day", async () => {
  const { job, statements, insightRanges } = build({ timezone: "Europe/London" });

  assert.equal(await job.run(USER, DATE), "succeeded");

  // 24 Aug 2026 in London (BST): 23:00 UTC on the 23rd to 23:00 UTC on the 24th.
  assert.equal(insightRanges.length, 1);
  assert.equal(insightRanges[0]?.since.toISOString(), "2026-08-23T23:00:00.000Z");
  assert.equal(insightRanges[0]?.until.toISOString(), "2026-08-24T23:00:00.000Z");

  const metric = accountMetric(statements);

  assert.ok(metric);
  assert.equal(metric.params[1], "2026-08-24", "filed under the day it describes");
  assert.equal(metric.params[3], 640);
});

test("a user without a timezone gets UTC day boundaries", async () => {
  const { job, insightRanges } = build({ timezone: null });

  await job.run(USER, DATE);

  assert.equal(insightRanges[0]?.since.toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(insightRanges[0]?.until.toISOString(), "2026-08-25T00:00:00.000Z");
});

test("a gated media refusal does not fail the run", async () => {
  const { job, statements, syncs } = build({ mediaFail: "permission" });

  assert.equal(await job.run(USER, DATE), "succeeded");
  assert.deepEqual(syncs, [USER]);
  assert.equal(
    statements.some((entry) =>
      entry.sql.includes(`INSERT INTO "instagram_post_metric"`),
    ),
    false,
  );
});

// A transient failure is a real failure: the sweep records it and retries.
test("a transient insights failure fails the run rather than storing a gap", async () => {
  const { job } = build({ insightsFail: "transient" });

  await assert.rejects(() => job.run(USER, DATE));
});

test("a dead token found mid-pull flags reconnect and skips", async () => {
  const { job, statusWrites } = build({ accountFails: "auth" });

  assert.equal(await job.run(USER, DATE), "skipped");
  assert.deepEqual(statusWrites, ["reconnect_required"]);
});

test("post metrics are written per media with absent values kept null", async () => {
  const { job, statements } = build();

  await job.run(USER, DATE);

  const post = statements.find((entry) =>
    entry.sql.includes(`INSERT INTO "instagram_post_metric"`),
  );

  // One statement for the whole page: every column arrives as an array.
  assert.ok(post);
  assert.deepEqual(post.params[2], ["m1"]);
  assert.deepEqual(post.params[6], [900], "views");
  assert.deepEqual(post.params[11], [null], "an absent save count stays null");
});

// The posts lists read a post's current state, not its daily history, so the
// caption and image are stored once per post rather than once a day.
test("each post's current state is upserted beside its daily reading", async () => {
  const { job, statements } = build();

  await job.run(USER, DATE);

  const post = statements.find((entry) =>
    entry.sql.includes(`INSERT INTO "instagram_post"\n`),
  );

  assert.ok(post);
  assert.ok(post.sql.includes(`ON CONFLICT ("userId", "mediaId")`));
  assert.deepEqual(post.params[1], ["m1"]);
  assert.deepEqual(post.params[5], ["Behind the scenes"], "caption");
  assert.deepEqual(post.params[6], ["https://cdn.example/m1.jpg"], "thumbnail");
  assert.deepEqual(post.params[7], [900], "views");
});

// The follower snapshot and its milestone gate live in InstagramService. Two
// write paths for follower data would have to agree forever.
test("follower snapshots are delegated, not reimplemented", async () => {
  const { job, statements, syncs } = build();

  await job.run(USER, DATE);

  assert.deepEqual(syncs, [USER]);
  assert.equal(
    statements.some((entry) =>
      entry.sql.includes(`INSERT INTO "follower_snapshot"`),
    ),
    false,
  );
});

// Only consented, connected users are enqueued at all — otherwise the sweep
// would create a row per user per day for people who never connected.
test("the job's scope names only live consented connections", () => {
  const { job } = build();

  assert.ok(job.scopeSql.includes(`"dataConsent" = true`));
  assert.ok(job.scopeSql.includes(`"disconnectedAt" IS NULL`));
  assert.ok(job.scopeSql.includes(`c."status" = 'connected'`));
});
