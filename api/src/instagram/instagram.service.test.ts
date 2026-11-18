import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  createTransactionHarness,
  fakeDispatcher,
  fakeEmitter,
  queryRouter,
} from "../content-engine/testing/content-event-fakes";
import type {
  FetchInstagramAccountInput,
  InstagramGraphAccount,
} from "./instagram-graph.port";
import { initialSyncPending, InstagramService } from "./instagram.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

interface FakeDbOptions {
  connectionInserted?: boolean; // false models the partial-unique gate already holding a live row
  connectionOrdinal?: number;
  disconnectAffected?: boolean;
  hasLiveConnection?: boolean;
  milestoneRows?: number[]; // tiers the milestone gate reports as newly reached
}

interface SnapshotDbOptions {
  liveConnection?: { connectedAt: Date } | null;
  latestSnapshot?: { localDate: string; followerCount: number } | null;
  previousWeekFollowerCount?: number | null;
  latestDay?: {
    localDate: string;
    reach: number | null;
    totalInteractions: number | null;
    views: number | null;
    profileViews: number | null;
  } | null;
}

function fakeGraph(followerCount: number) {
  const calls: FetchInstagramAccountInput[] = [];
  return {
    calls,
    fetchAccount: async (
      input: FetchInstagramAccountInput,
    ): Promise<InstagramGraphAccount> => {
      calls.push(input);
      return {
        externalAccountId: `stub:${input.credential}`,
        username: input.credential,
        followerCount,
      };
    },
  };
}

function buildFakeDb(options: FakeDbOptions = {}) {
  const query = queryRouter([
    {
      match: (sql) => sql.includes('INSERT INTO "platform_connection"'),
      handle: () =>
        options.connectionInserted === false
          ? [[], 0]
          : [{ connectionOrdinal: options.connectionOrdinal ?? 1 }],
    },
    {
      match: (sql) => sql.includes('UPDATE "platform_connection"'),
      handle: () => (options.disconnectAffected === false ? [[], 0] : [{ id: "row-1" }]),
    },
    {
      match: (sql) => sql.includes("SELECT 1"),
      handle: () => (options.hasLiveConnection === false ? [] : [{ "?column?": 1 }]),
    },
    {
      match: (sql) => sql.includes('INSERT INTO "follower_snapshot"'),
      handle: () => [[], 1],
    },
    {
      match: (sql) => sql.includes('INSERT INTO "follower_milestone"'),
      handle: () => (options.milestoneRows ?? []).map((tier) => ({ tier })),
    },
  ]);

  // InstagramService queries both through its own transaction's manager and,
  // for disconnect()/the live-connection check, directly on the DataSource —
  // both read from the same fake DB, so both are bound to the same query fn.
  const harness = createTransactionHarness({ query, findOneBy: async () => null });
  const dataSource = { ...harness.dataSource, query };

  return { dataSource, isTransactionOpen: harness.isTransactionOpen };
}

function buildService(dbOptions: FakeDbOptions, followerCount: number) {
  const db = buildFakeDb(dbOptions);
  const emitter = fakeEmitter();
  const dispatcher = fakeDispatcher({ isTransactionOpen: db.isTransactionOpen });
  const graph = fakeGraph(followerCount);

  const service = new InstagramService(
    db.dataSource as never,
    emitter as never,
    dispatcher as never,
    graph as never,
  );

  return { service, emitter, dispatcher, graph };
}

function buildSnapshotService(options: SnapshotDbOptions) {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const query = async (sql: string, params: readonly unknown[] = []) => {
    queries.push({ sql, params });

    if (sql.includes('SELECT "connectedAt"')) {
      return options.liveConnection ? [options.liveConnection] : [];
    }

    if (sql.includes('SELECT "localDate", "followerCount"')) {
      return options.latestSnapshot ? [options.latestSnapshot] : [];
    }

    if (sql.includes('FROM "instagram_account_metric"')) {
      return options.latestDay ? [options.latestDay] : [];
    }

    if (sql.includes('SELECT "followerCount"')) {
      return options.previousWeekFollowerCount === null ||
        options.previousWeekFollowerCount === undefined
        ? []
        : [{ followerCount: options.previousWeekFollowerCount }];
    }

    throw new Error(`Unexpected analytics query:\n${sql}`);
  };

  const graph = fakeGraph(0);
  const service = new InstagramService(
    { query } as never,
    fakeEmitter() as never,
    fakeDispatcher() as never,
    graph as never,
  );

  return { service, queries };
}

test("analytics snapshot reports a disconnected user without reading snapshots", async () => {
  const { service, queries } = buildSnapshotService({
    liveConnection: null,
  });

  assert.deepEqual(await service.getAnalyticsSnapshot(user.id), {
    connected: false,
    syncing: false,
    snapshot: null,
  });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.params, [user.id, "instagram"]);
});

test("analytics snapshot returns the current followers and signed week delta", async () => {
  const connectedAt = new Date("2025-10-01T12:00:00.000Z");
  const { service } = buildSnapshotService({
    liveConnection: { connectedAt },
    latestSnapshot: { localDate: "2025-10-15", followerCount: 1_250 },
    previousWeekFollowerCount: 1_000,
  });

  assert.deepEqual(await service.getAnalyticsSnapshot(user.id), {
    connected: true,
    syncing: false,
    snapshot: {
      followers: 1_250,
      followerDeltaWeek: 250,
      connectedSince: connectedAt.toISOString(),
      latestDay: null,
    },
  });
});

test("analytics snapshot carries the latest day's insights", async () => {
  const { service } = buildSnapshotService({
    liveConnection: { connectedAt: new Date("2025-10-01T12:00:00.000Z") },
    latestSnapshot: { localDate: "2025-10-15", followerCount: 1_250 },
    previousWeekFollowerCount: null,
    latestDay: {
      localDate: "2025-10-15",
      reach: 820,
      totalInteractions: 41,
      views: 1_900,
      profileViews: 37,
    },
  });

  const result = await service.getAnalyticsSnapshot(user.id);

  assert.deepEqual(result.snapshot?.latestDay, {
    localDate: "2025-10-15",
    reach: 820,
    interactions: 41,
    views: 1_900,
    profileViews: 37,
  });
});

test("analytics snapshot keeps the current value but shows a neutral state without a prior week", async () => {
  const { service } = buildSnapshotService({
    liveConnection: { connectedAt: new Date("2025-10-01T12:00:00.000Z") },
    latestSnapshot: { localDate: "2025-10-02", followerCount: 250 },
    previousWeekFollowerCount: null,
  });

  assert.deepEqual(await service.getAnalyticsSnapshot(user.id), {
    connected: true,
    syncing: false,
    snapshot: {
      followers: 250,
      followerDeltaWeek: null,
      connectedSince: "2025-10-01T12:00:00.000Z",
      latestDay: null,
    },
  });
});

test("analytics snapshot reports a live connection with no follower history", async () => {
  const { service } = buildSnapshotService({
    liveConnection: { connectedAt: new Date("2025-10-01T12:00:00.000Z") },
    latestSnapshot: null,
  });

  assert.deepEqual(await service.getAnalyticsSnapshot(user.id), {
    connected: true,
    syncing: false,
    snapshot: null,
  });
});

test("analytics snapshot reports syncing right after a connect", async () => {
  const { service } = buildSnapshotService({
    liveConnection: { connectedAt: new Date(Date.now() - 30_000) },
    latestSnapshot: { localDate: "2025-10-15", followerCount: 454 },
    previousWeekFollowerCount: null,
  });

  const result = await service.getAnalyticsSnapshot(user.id);

  assert.equal(result.syncing, true);
  assert.equal(result.snapshot?.followers, 454);
});

test("connecting with a follower count under every tier emits only platform.connected", async () => {
  const { service, emitter, dispatcher } = buildService({}, 42);

  const result = await service.connect(user.id, { credential: "handle" });

  assert.equal(result.connected, true);
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.platformConnected],
  );
  assert.deepEqual(emitter.emitted[0]?.payload, {
    userId: "user-1",
    platform: "instagram",
  });
  assert.equal(dispatcher.sawOpenTransaction, false);
});

test("connecting with a follower count already past a tier also emits follower.milestone in the same commit", async () => {
  const { service, emitter } = buildService({ milestoneRows: [100] }, 250);

  const result = await service.connect(user.id, { credential: "handle" });

  assert.equal(result.connected, true);
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.platformConnected, eventNameTokens.followerMilestone],
  );
  assert.deepEqual(emitter.emitted[1]?.payload, {
    userId: "user-1",
    tier: 100,
    followerCount: 250,
  });
});

test("losing the connection gate emits no platform.connected", async () => {
  const { service, emitter } = buildService({ connectionInserted: false }, 42);

  const result = await service.connect(user.id, { credential: "handle" });

  assert.equal(result.connected, false);
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [],
  );
});

// A connect() call against an already-live connection is how a follower
// count gets refreshed by re-tapping "Connect Instagram" — it must not be a
// silent no-op just because there is nothing new to connect.
test("connecting while already connected still refreshes followers", async () => {
  const { service, emitter } = buildService(
    { connectionInserted: false, milestoneRows: [100] },
    250,
  );

  const result = await service.connect(user.id, { credential: "handle:250" });

  assert.equal(result.connected, false, "no new connection was made");
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventName),
    [eventNameTokens.followerMilestone],
  );
});

test("a reconnect uses the new connectionOrdinal in its stable ID", async () => {
  const { service, emitter } = buildService({ connectionOrdinal: 2 }, 0);

  await service.connect(user.id, { credential: "handle" });

  assert.equal(
    emitter.emitted[0]?.eventId,
    `${eventNameTokens.platformConnected}:user-1:instagram:2`,
  );
});

test("disconnect reports whether a live connection was actually closed", async () => {
  const connected = buildService({ disconnectAffected: true }, 0);
  assert.deepEqual(await connected.service.disconnect(user.id), { disconnected: true });

  const alreadyGone = buildService({ disconnectAffected: false }, 0);
  assert.deepEqual(await alreadyGone.service.disconnect(user.id), {
    disconnected: false,
  });
});

test("syncing followers without a live connection throws PLATFORM_NOT_CONNECTED", async () => {
  const { service } = buildService({ hasLiveConnection: false }, 12000);

  await assert.rejects(
    () => service.syncFollowers(user.id, { credential: "handle" }),
    /PLATFORM_NOT_CONNECTED|Connect Instagram/,
  );
});

test("a large jump emits every newly crossed tier ascending, and a re-sync emits none", async () => {
  const { service, emitter } = buildService(
    { hasLiveConnection: true, milestoneRows: [100, 1000, 10000] },
    12000,
  );

  const result = await service.syncFollowers(user.id, { credential: "handle" });

  assert.deepEqual(result.reachedTiers, [100, 1000, 10000]);
  assert.deepEqual(
    emitter.emitted.map((event) => event.eventId),
    [
      `${eventNameTokens.followerMilestone}:user-1:100`,
      `${eventNameTokens.followerMilestone}:user-1:1000`,
      `${eventNameTokens.followerMilestone}:user-1:10000`,
    ],
  );

  const reSync = buildService({ hasLiveConnection: true, milestoneRows: [] }, 12000);
  const reSyncResult = await reSync.service.syncFollowers(user.id, { credential: "handle" });
  assert.deepEqual(reSyncResult.reachedTiers, []);
  assert.deepEqual(reSync.emitter.emitted, []);
});

test("the first pull after a connect is pending until it completes", () => {
  const connectedAt = new Date("2026-10-14T13:00:00.000Z");
  const twoMinutesLater = new Date("2026-10-14T13:02:00.000Z");

  assert.equal(initialSyncPending(connectedAt, null, twoMinutesLater), true);
  assert.equal(
    initialSyncPending(
      connectedAt,
      new Date("2026-10-14T13:00:20.000Z"),
      twoMinutesLater,
    ),
    false,
  );
});

test("a pull from before a reconnect does not end the wait", () => {
  const connectedAt = new Date("2026-10-14T13:00:00.000Z");

  assert.equal(
    initialSyncPending(
      connectedAt,
      new Date("2026-10-13T06:00:00.000Z"),
      new Date("2026-10-14T13:01:00.000Z"),
    ),
    true,
  );
});

test("an old connection with no pull is not reported as syncing", () => {
  assert.equal(
    initialSyncPending(
      new Date("2026-10-14T13:00:00.000Z"),
      null,
      new Date("2026-10-14T13:30:00.000Z"),
    ),
    false,
  );
});
