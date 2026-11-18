import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import appDataSource from "../database/data-source";
import { InstagramService } from "../instagram/instagram.service";
import { StubInstagramGraph } from "../instagram/stub-instagram-graph";
import { noopProductAnalytics } from "../observability/product-analytics.port";

// Narrated walkthrough of the Instagram event contract: connect -> 12,000
// followers -> three ascending milestones -> a same-day re-sync emits
// nothing -> a reconnect emits a second platform.connected. Drives the REAL
// InstagramService (behind the stub Graph API port) against a real database.
//
//   DEMO_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api demo:instagram-event

const DEMO_DATABASE_URL =
  process.env.DEMO_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/contentual_test";

const USER_ID = "demo-instagram-creator";

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Demo Instagram Creator",
  onboardingCompleted: true,
};

let dataSource: DataSource;

const evaluator: ContentEventEvaluator = {
  evaluate: async (event) => {
    console.log(`      🎁  RULE ENGINE RECEIVED  →  ${event.eventName}`);
  },
};

function scene(title: string): void {
  console.log(`\n${"─".repeat(72)}\n  ${title}\n${"─".repeat(72)}`);
}

function step(text: string): void {
  console.log(`\n  ${text}`);
}

async function pause(ms = 900): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildService() {
  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );

  return new InstagramService(dataSource, emitter, dispatcher, new StubInstagramGraph());
}

async function showOutbox(): Promise<void> {
  const rows = await dataSource.query(
    `SELECT "eventName", "payload" FROM "content_engine_events"
       WHERE "userId" = $1 ORDER BY "createdAt"`,
    [USER_ID],
  );
  console.log("\n      content_engine_events:");
  console.table(rows.map((row: { eventName: string; payload: unknown }) => ({
    eventName: row.eventName,
    payload: JSON.stringify(row.payload),
  })));
}

async function resetUser(): Promise<void> {
  for (const table of [
    "content_engine_events",
    "follower_milestone",
    "follower_snapshot",
    "platform_connection",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(
    `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, user.name, user.email],
  );
}

async function main(): Promise<void> {
  dataSource = new DataSource({
    ...appDataSource.options,
    url: DEMO_DATABASE_URL,
    logging: false,
  } as typeof appDataSource.options);

  Logger.overrideLogger(false);

  await dataSource.initialize();
  await dataSource.runMigrations();

  console.log(`\n  Content Engine — Instagram event contract demo`);
  console.log(`  database: ${DEMO_DATABASE_URL}`);

  await resetUser();
  const instagram = buildService();

  scene("1. Connect — a real Graph API call, then platform.connected");
  step('creator connects "creator_handle" with 12,000 followers:');
  await instagram.connect(user.id, { credential: "creator_handle:12000" });
  await showOutbox();
  console.log("      ↑ platform.connected, plus three follower.milestone events —");
  console.log("        the connect carried a count high enough to cross all three tiers.");
  await pause(1800);

  scene("2. A same-day re-sync crosses no new tiers");
  step("creator's follower count is re-synced at the same value:");
  const reSync = await instagram.syncFollowers(user.id, { credential: "creator_handle:12000" });
  console.log(`      🔁  tiers newly reached: [${reSync.reachedTiers.join(", ") || "none"}]`);
  await showOutbox();
  console.log("      ↑ unchanged — every tier was already crossed, so nothing re-fires.");
  await pause(1800);

  scene("3. Disconnect, then reconnect — a legitimate second platform.connected");
  step("creator disconnects, then reconnects the same account:");
  await instagram.disconnect(user.id);
  await instagram.connect(user.id, { credential: "creator_handle:12000" });
  await showOutbox();
  console.log("      ↑ a second platform.connected, with a new connectionOrdinal.");
  console.log("        No new follower.milestone rows: every tier was already crossed.");

  await resetUser();
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error("\n  demo failed:", error);
  process.exit(1);
});
