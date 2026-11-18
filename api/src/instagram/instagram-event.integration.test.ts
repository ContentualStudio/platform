import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { PlatformConnections1784730000000 } from "../database/migrations/1784730000000-PlatformConnections";
import { InstagramTokenStore1784890000000 } from "../database/migrations/1784890000000-InstagramTokenStore";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import type { InstagramGraphAccount } from "./instagram-graph.port";
import { InstagramService } from "./instagram.service";
import { noopProductAnalytics } from "../observability/product-analytics.port";


const USER_ID = "instagram-event-user";

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Instagram Event",
  onboardingCompleted: true,
};

let dataSource: DataSource;

const evaluator: ContentEventEvaluator = { evaluate: async () => {} };

function fakeGraph(followerCount: number) {
  return {
    fetchAccount: async (): Promise<InstagramGraphAccount> => ({
      externalAccountId: "stub:handle",
      username: "handle",
      followerCount,
    }),
  };
}

function buildService(followerCount: number) {
  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );

  return {
    service: new InstagramService(
      dataSource,
      emitter,
      dispatcher,
      fakeGraph(followerCount) as never,
    ),
  };
}

// `createdAt` defaults to now(), which in Postgres is the *transaction*
// timestamp — so every event connect() emits shares one value to the
// microsecond and cannot order them relative to each other. "id" is added only
// to make the result reproducible run to run; it carries no emit-order meaning.
// Callers must therefore treat same-transaction events as a set, not a
// sequence.
async function outboxEventNames() {
  const rows = (await dataSource.query(
    `SELECT "eventName" FROM "content_engine_events" WHERE "userId" = $1
     ORDER BY "createdAt", "id"`,
    [USER_ID],
  )) as { eventName: string }[];
  return rows.map((row) => row.eventName);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  for (const table of [
    "content_engine_events",
    "follower_milestone",
    "follower_snapshot",
    "platform_connection",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.query(
    `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
    [USER_ID, user.name, user.email],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  for (const table of [
    "content_engine_events",
    "follower_milestone",
    "follower_snapshot",
    "platform_connection",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
});

test(
  "connect -> 12,000 followers -> three ascending milestones -> re-sync emits none -> reconnect emits a second platform.connected",
  { skip },
  async () => {
    const { service } = buildService(12000);

    const connectResult = await service.connect(user.id, { credential: "handle:12000" });
    assert.equal(connectResult.connected, true);

    // Compared as a set: all four are emitted in one transaction, so the outbox
    // records no order between them and asserting a sequence would be asserting
    // whichever order the planner happened to return.
    assert.deepEqual([...(await outboxEventNames())].sort(), [
      eventNameTokens.followerMilestone,
      eventNameTokens.followerMilestone,
      eventNameTokens.followerMilestone,
      eventNameTokens.platformConnected,
    ]);

    // Ordered by the tier itself rather than createdAt, which ties for the same
    // reason. The claim under test is that all three tiers were crossed.
    const milestoneRows = (await dataSource.query(
      `SELECT "payload" FROM "content_engine_events"
       WHERE "userId" = $1 AND "eventName" = $2
       ORDER BY ("payload" ->> 'tier')::bigint`,
      [USER_ID, eventNameTokens.followerMilestone],
    )) as { payload: Record<string, unknown> }[];
    assert.deepEqual(
      milestoneRows.map((row) => row.payload.tier),
      [100, 1000, 10000],
    );

    // platform.connected is reachable only through the platform_connection
    // gate: one connected event, one live row.
    const connections = (await dataSource.query(
      `SELECT "connectionOrdinal", "disconnectedAt" FROM "platform_connection" WHERE "userId" = $1`,
      [USER_ID],
    )) as { connectionOrdinal: number; disconnectedAt: Date | null }[];
    assert.equal(connections.length, 1);
    assert.equal(connections[0]?.connectionOrdinal, 1);

    const eventsBeforeResync = (await outboxEventNames()).length;
    const reSyncResult = await service.syncFollowers(user.id, { credential: "handle:12000" });
    assert.deepEqual(reSyncResult.reachedTiers, []);
    assert.equal((await outboxEventNames()).length, eventsBeforeResync);

    const disconnectResult = await service.disconnect(user.id);
    assert.equal(disconnectResult.disconnected, true);

    const reconnectResult = await service.connect(user.id, { credential: "handle:12000" });
    assert.equal(reconnectResult.connected, true);

    const reconnectEvents = await outboxEventNames();
    assert.equal(
      reconnectEvents.filter((name) => name === eventNameTokens.platformConnected)
        .length,
      2,
      "a reconnect must emit a second platform.connected",
    );
    // No new follower.milestone rows: every tier was already crossed.
    assert.equal(
      reconnectEvents.filter((name) => name === eventNameTokens.followerMilestone)
        .length,
      3,
    );

    const allConnections = (await dataSource.query(
      `SELECT "connectionOrdinal" FROM "platform_connection" WHERE "userId" = $1 ORDER BY "connectionOrdinal"`,
      [USER_ID],
    )) as { connectionOrdinal: number }[];
    assert.deepEqual(
      allConnections.map((row) => row.connectionOrdinal),
      [1, 2],
    );
  },
);

test(
  "the migration is reversible and round-trips all three tables",
  { skip },
  async () => {
    const migration = new PlatformConnections1784730000000();
    // The credential store has a foreign key onto `platform_connection`, so it
    // has to come down first and go back up last. Reverting migrations in
    // reverse order is what `migration:revert` does anyway; doing it by hand
    // here keeps the round-trip honest rather than dropping the dependent table
    // with a CASCADE that would hide the coupling.
    const dependent = new InstagramTokenStore1784890000000();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    // Always rolled back: replaying an old migration on the shared test
    // database would otherwise drop every column later migrations added.
    await runner.startTransaction();

    try {
      await dependent.down(runner);
      await migration.down(runner);
      assert.equal(await runner.hasTable("follower_milestone"), false);
      assert.equal(await runner.hasTable("follower_snapshot"), false);
      assert.equal(await runner.hasTable("platform_connection"), false);

      await migration.up(runner);
      await dependent.up(runner);
      assert.equal(await runner.hasTable("platform_connection"), true);
      assert.equal(await runner.hasTable("platform_connection_credential"), true);
      assert.equal(await runner.hasTable("follower_snapshot"), true);
      assert.equal(await runner.hasTable("follower_milestone"), true);

      await runner.query(
        `INSERT INTO "follower_milestone" ("userId", "platform", "tier", "followerCount")
         VALUES ($1, 'instagram', 100, 150)`,
        [USER_ID],
      );

      await assert.rejects(
        () =>
          runner.query(
            `UPDATE "follower_milestone" SET "tier" = 999 WHERE "userId" = $1`,
            [USER_ID],
          ),
        /CHK_follower_milestone_tier/,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  },
);
