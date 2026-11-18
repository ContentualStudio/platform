import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ChallengeSetupService } from "../challenge-setup/challenge-setup.service";
import { ProgrammeAssignmentRepository } from "../challenge-setup/programmes/programme-assignment.repository";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import { staticProgrammeContentReader } from "../challenge-setup/programmes/programme-content.testing";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import appDataSource from "../database/data-source";
import { GamificationService } from "../gamification/gamification.service";
import { ProgrammeTaskService } from "../programme-tasks/programme-task.service";
import { noopProductAnalytics } from "../observability/product-analytics.port";

// Narrated walkthrough of the Programmes & Tasks / Gamification event
// contract: begin -> complete tasks -> a week closes -> a streak extends -> a
// level changes, then the same failure/recovery story as
// demo-programme-event.ts. Drives the REAL services against a real database.
//
//   DEMO_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api demo:task-event

const DEMO_DATABASE_URL =
  process.env.DEMO_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/contentual_test";

const USER_ID = "demo-task-creator";
const PROGRAMME_ID = "15-day-jumpstart";
const PROGRAMME_VERSION_ID = `${PROGRAMME_ID}-v1`;
const LAST_WEEK3_TASK_ID = `${PROGRAMME_ID}-day-15`; // the only task in week 3
const FIRST_TASK_ID = `${PROGRAMME_ID}-day-1`;

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Demo Task Creator",
  onboardingCompleted: true,
};

let dataSource: DataSource;
let engineOnline = true;

const evaluator: ContentEventEvaluator = {
  evaluate: async (event) => {
    if (!engineOnline) {
      throw new Error("rewards engine unreachable");
    }
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

function buildServices() {
  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    noopProductAnalytics,
  );
  const gamification = new GamificationService(emitter);
  return {
    dispatcher,
    setupService: new ChallengeSetupService(
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
    taskService: new ProgrammeTaskService(
      dataSource,
      emitter,
      dispatcher,
      gamification,
      new ProgrammeEnrolmentService(dataSource, staticProgrammeContentReader),
      staticProgrammeContentReader,
    ),
  };
}

async function showOutbox(): Promise<void> {
  const rows = await dataSource.query(
    `SELECT "eventName", "status", "attemptCount", "lastError"
       FROM "content_engine_events" WHERE "userId" = $1 ORDER BY "createdAt"`,
    [USER_ID],
  );
  console.log("\n      content_engine_events:");
  console.table(rows);
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function resetUser(): Promise<void> {
  for (const table of [
    "content_engine_events",
    "programme_task_progress",
    "programme_week_completion",
    "user_streak",
    "user_level",
    "challenge_setup",
    "user_profile",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [USER_ID]);
  }
  await dataSource.query(
    `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, user.name, user.email],
  );
  await dataSource.query(
    `INSERT INTO "user_profile" ("userId","timezone") VALUES ($1,$2)`,
    [USER_ID, "UTC"],
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

  Logger.overrideLogger(false);

  await dataSource.initialize();
  await dataSource.runMigrations();

  console.log(`\n  Content Engine — Programmes & Tasks / Gamification event contract demo`);
  console.log(`  database: ${DEMO_DATABASE_URL}`);

  // ── 1 ────────────────────────────────────────────────────────────────────
  scene("1. Begin the programme");
  await resetUser();
  const { setupService, taskService } = buildServices();
  step('creator taps "Begin Programme":');
  await setupService.beginProgramme(user);
  await showOutbox();
  await pause(1200);

  // ── 2 ────────────────────────────────────────────────────────────────────
  scene("2. One task completion closes a week, extends a streak, and promotes a level");
  step("nine prior lifetime completions and an active streak as of yesterday (seeded facts):");
  for (let index = 0; index < 9; index += 1) {
    await dataSource.query(
      `INSERT INTO "programme_task_progress"
         ("userId","programmeId","taskId","outcome","weekIndex","contentType","localDate")
       VALUES ($1,$2,$3,'completed',1,'video',$4::date)`,
      [USER_ID, PROGRAMME_ID, `seed-task-${index}`, isoDaysAgo(10)],
    );
  }
  await dataSource.query(
    `INSERT INTO "user_streak"
       ("userId","lastActiveDate","runStartedDate","currentLength","longestLength","runOrdinal")
     VALUES ($1,$2::date,$2::date,1,1,1)`,
    [USER_ID, isoDaysAgo(1)],
  );
  step(`creator completes ${LAST_WEEK3_TASK_ID} — the only task in week 3, and their 10th lifetime completion:`);
  await taskService.completeTask(user, LAST_WEEK3_TASK_ID);
  await showOutbox();
  console.log("      ↑ FOUR events, ONE commit: task.completed → week.completed →");
  console.log("        streak.reached → level.changed. Cause before effect, always in that order.");
  await pause(1800);

  // ── 3 ────────────────────────────────────────────────────────────────────
  scene("3. The rule engine is DOWN — the facts are not lost");
  await resetUser();
  const { setupService: s3setup, taskService: t3, dispatcher: d3 } = buildServices();
  await s3setup.beginProgramme(user); // silent — Begin Programme was already shown in scene 1
  engineOnline = false;
  step(`creator completes ${FIRST_TASK_ID} while the rule engine is unreachable:`);
  await t3.completeTask(user, FIRST_TASK_ID);
  await showOutbox();
  console.log("      ↑ pending, with the error recorded. The task genuinely completed —");
  console.log("        the creator saw no failure.");
  await pause(1500);

  step("the rule engine comes back online, and the queue is retried:");
  engineOnline = true;
  await dataSource.query(
    `UPDATE "content_engine_events" SET "availableAt" = now() - interval '1 minute'
      WHERE "userId" = $1`,
    [USER_ID],
  );
  await d3.dispatchPending(25);
  await showOutbox();
  console.log("      ↑ delivered — the same event, once.");

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
