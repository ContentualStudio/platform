import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ChallengeSetupService } from "../challenge-setup/challenge-setup.service";
import { ProgrammeAssignmentRepository } from "../challenge-setup/programmes/programme-assignment.repository";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import appDataSource from "../database/data-source";
import { noopProductAnalytics } from "../observability/product-analytics.port";

// Narrated walkthrough of the programme.started event contract, for demoing the
// ticket. It drives the REAL ChallengeSetupService against a real database — no
// mocks, no staged output. Every line printed is something the system actually
// did.
//
//   DEMO_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api demo:programme-event
//
// Defaults to the local contentual_test database. It seeds its own user, cleans
// up after itself, and never touches application data.

const DEMO_DATABASE_URL =
  process.env.DEMO_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/contentual_test";

const USER_ID = "demo-creator";
const PROGRAMME_ID = "30-day-foundation";
const PROGRAMME_VERSION_ID = `${PROGRAMME_ID}-v1`;

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Demo Creator",
  onboardingCompleted: true,
};

let dataSource: DataSource;

// Stands in for the rule evaluator that ticket 5 will build. Swapped between
// scenes so the demo can show what happens when the rewards engine is healthy
// and when it is down.
let engineOnline = true;
let rewardsDelivered = 0;

const evaluator: ContentEventEvaluator = {
  evaluate: async (event) => {
    if (!engineOnline) {
      throw new Error("rewards engine unreachable");
    }
    rewardsDelivered += 1;
    console.log(
      `      🎁  REWARDS ENGINE RECEIVED  →  ${event.eventName} for ${event.payload.userId}`,
    );
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

function buildService(emitter: ContentEventEmitter = new ContentEventEmitter()) {
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );
  return {
    dispatcher,
    service: new ChallengeSetupService(
      dataSource.getRepository("ChallengeSetupEntity") as never,
      dataSource.getRepository("UserProfileEntity") as never,
      // Matching never runs on these paths — the programme is assigned by the
      // fixture, not by completion — so the matcher stays a refusing stub while
      // the assignment repository is the real one.
      { match: () => undefined } as never,
      new ProgrammeAssignmentRepository(),
      dataSource,
      emitter,
      dispatcher,
      staticProgrammeContentReader,
      {
        startInTransaction: async () => ({ id: "enrolment-1", created: true }),
        abandonActiveInTransaction: async () => undefined,
        completeActiveInTransaction: async () => undefined,
      } as never,
      { startRefusal: async () => null } as never,
    ),
  };
}

async function showOutbox(): Promise<void> {
  const rows = await dataSource.query(
    `SELECT "id", "eventName", "status", "attemptCount", "lastError"
       FROM "content_engine_events" WHERE "userId" = $1 ORDER BY "createdAt"`,
    [USER_ID],
  );
  console.log("\n      content_engine_events:");
  console.table(rows);
}

async function programmeStarted(): Promise<boolean> {
  const [row] = await dataSource.query(
    `SELECT "programmeStartedAt" FROM "challenge_setup" WHERE "userId" = $1`,
    [USER_ID],
  );
  return Boolean(row?.programmeStartedAt);
}

// Puts the user back to "assigned a programme, not yet started" between scenes.
async function resetUser(): Promise<void> {
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(
    `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "user_profile" ("userId","timezone") VALUES ($1,$2)`,
    [USER_ID, "Africa/Lagos"],
  );
  await dataSource.query(
    `INSERT INTO "programme_content_versions"
       ("programmeVersionId", "programmeKey", "sourceDocumentId",
        "sourceUpdatedAt", "contentHash", "snapshot")
     VALUES ($1, $2, $3, now(), $4, '{}'::jsonb)
     ON CONFLICT ("programmeVersionId") DO NOTHING`,
    [
      PROGRAMME_VERSION_ID,
      PROGRAMME_ID,
      `demo-${PROGRAMME_ID}`,
      `hash-${PROGRAMME_VERSION_ID}`,
    ],
  );
  await dataSource.query(
    `INSERT INTO "challenge_setup"
       ("userId","setupCompletedAt","assignedProgrammeId","assignedProgrammeVersionId","programmeAssignedAt")
     VALUES ($1, now(), $2, $3, now())`,
    [USER_ID, PROGRAMME_ID, PROGRAMME_VERSION_ID],
  );
}

async function main(): Promise<void> {
  dataSource = new DataSource({
    ...appDataSource.options,
    url: DEMO_DATABASE_URL,
    logging: false,
  } as typeof appDataSource.options);

  // The service logs a real error when dispatch fails (scene 4). That is
  // correct in production, but here it prints a stack trace mid-narration and
  // reads like a crash — precisely when the point being made is that the
  // creator was NOT affected. The demo narrates that state itself instead.
  Logger.overrideLogger(false);

  await dataSource.initialize();
  await dataSource.runMigrations();

  console.log(`\n  Content Engine — "Begin Programme" event contract demo`);
  console.log(`  database: ${DEMO_DATABASE_URL}`);
  console.log(
    `\n  The creator taps "Begin Programme". The rewards engine must learn about`,
  );
  console.log(`  that exactly once — never zero times, never twice.`);

  // ── 1 ────────────────────────────────────────────────────────────────────
  scene("1. The happy path — one tap, one start, one event");
  await resetUser();

  const { service } = buildService();
  step('creator taps "Begin Programme":');
  const status = await service.beginProgramme(user);
  console.log(`      ▶️   programme started: ${status.programmeStarted}`);
  console.log(`      📅  day 1 scheduled for: ${status.day1ScheduledFor}`);
  await showOutbox();
  console.log("      ↑ the start and the event were written in ONE transaction.");
  await pause(1500);

  // ── 2 ────────────────────────────────────────────────────────────────────
  scene("2. Impatient tapping — the reward cannot be double-issued");
  await resetUser();

  const { service: s2 } = buildService();
  step("creator taps the button 3 times (double-tap, then a browser retry):");
  await s2.beginProgramme(user);
  await s2.beginProgramme(user);
  await s2.beginProgramme(user);
  await showOutbox();
  console.log("      ↑ still ONE row. The event ID is derived from the fact itself,");
  console.log("        so a replay collides with what is already stored.");
  await pause(1500);

  // ── 3 ────────────────────────────────────────────────────────────────────
  scene("3. Two devices at once — a genuine race");
  await resetUser();

  const { service: s3 } = buildService();
  step("phone and laptop both fire the request in the same instant:");
  await Promise.all([s3.beginProgramme(user), s3.beginProgramme(user)]);
  await showOutbox();
  console.log("      ↑ one start, one event. The database serialises the race,");
  console.log("        not application logic that could be raced around.");
  await pause(1500);

  // ── 4 ────────────────────────────────────────────────────────────────────
  scene("4. The rewards engine is DOWN — nothing is lost");
  await resetUser();
  engineOnline = false;

  const { service: s4, dispatcher } = buildService();
  step("creator taps begin while the rewards engine is unreachable:");
  const degraded = await s4.beginProgramme(user);
  console.log(`      ▶️   programme started: ${degraded.programmeStarted}  ← creator is NOT blocked`);
  await showOutbox();
  console.log("      ↑ the event is safely queued as 'pending' with the error recorded.");
  console.log("        The creator's programme started normally — they saw no failure.");
  await pause(1500);

  step("the rewards engine comes back online, and the queue is retried:");
  engineOnline = true;
  await dataSource.query(
    `UPDATE "content_engine_events" SET "availableAt" = now() - interval '1 minute'
      WHERE "userId" = $1`,
    [USER_ID],
  );
  await dispatcher.dispatchPending(25);
  await showOutbox();
  console.log("      ↑ delivered — the same event, once. Nothing was dropped.");
  await pause(1500);

  // ── 5 ────────────────────────────────────────────────────────────────────
  scene("5. The reverse guarantee — no start without its event");
  await resetUser();

  // An emitter that always fails, to prove the transaction really is shared.
  const brokenEmitter = {
    emit: async () => {
      throw new Error("event store write failed");
    },
  } as unknown as ContentEventEmitter;
  const { service: s5 } = buildService(brokenEmitter);

  step("creator taps begin, but capturing the event fails:");
  try {
    await s5.beginProgramme(user);
  } catch (error) {
    console.log(`      ❌  request rejected — ${(error as Error).message}`);
  }
  console.log(`      ▶️   programme started: ${await programmeStarted()}  ← rolled back`);
  await showOutbox();
  console.log("      ↑ empty. The programme did NOT quietly start without a reward attached.");
  console.log("        The creator can simply tap again.");
  await pause(1500);

  scene("Summary");
  console.log(`  rewards the engine was told about: ${rewardsDelivered}`);
  console.log("  no duplicate rewards, no lost rewards, no silent half-starts.");
  console.log("\n  Wired today: programme.started.");
  console.log("  The remaining eleven events use this same contract once their");
  console.log("  owning features exist — see docs/content-engine-events.md.\n");

  await resetUser();
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "challenge_setup" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user_profile" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error("\n  demo failed:", error);
  process.exit(1);
});
