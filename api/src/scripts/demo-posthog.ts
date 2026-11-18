import "reflect-metadata";
import { HttpStatus, NotFoundException, type ArgumentsHost } from "@nestjs/common";
import { DataSource } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import posthogConfig, { defaultPostHogHost } from "../config/posthog.config";
import { contentEventIds } from "../content-engine/event-ids";
import { ContentEngineEventEntity } from "../content-engine/entities/content-engine-event.entity";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import appDataSource from "../database/data-source";
import { PostHogErrorTracking } from "../observability/error-tracking.service";
import {
  PostHogClientProvider,
  type PostHogCapture,
} from "../observability/posthog-client.provider";
import { PostHogProductAnalytics } from "../observability/product-analytics.service";
import { UnhandledExceptionFilter } from "../observability/unhandled-exception.filter";

// Narrated walkthrough of the PostHog observability contract, for demoing the
// ticket. It drives the REAL services — the real dispatcher against a real
// database, the real analytics service, the real redactor, the real exception
// filter — with only the network client replaced by a recorder. Every event
// printed is one the system genuinely produced and would have sent.
//
//   DEMO_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api demo:posthog
//
// Needs no PostHog credential: the point is to show what is captured, and a
// recorder shows that more legibly than a network call nobody can see. To prove
// delivery as well, set POSTHOG_API_KEY and follow the checklist the summary
// prints.
//
// Defaults to the local contentual_test database. It seeds its own user, cleans
// up after itself, and never touches application data.

const DEMO_DATABASE_URL =
  process.env.DEMO_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/contentual_test";

const USER_ID = "demo-posthog-creator";
const PROGRAMME_ID = "30-day-foundation";
const TASK_ID = "day-1-hook";

interface Captured {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  uuid?: string;
}

interface CapturedException {
  error: unknown;
  distinctId?: string;
  properties?: Record<string, unknown>;
}

const captures: Captured[] = [];
const exceptions: CapturedException[] = [];

// The one thing that is not real: instead of batching to eu.i.posthog.com, the
// client records what it was handed. Everything upstream of it — identity,
// property redaction, the dedupe uuid — has already happened by this point.
const recorder: PostHogCapture = {
  capture(input) {
    captures.push(input);
  },
  captureException(error, distinctId, additionalProperties) {
    exceptions.push({ error, distinctId, properties: additionalProperties });
  },
  async shutdown() {},
};

function providerWith(client: PostHogCapture): PostHogClientProvider {
  return { client } as PostHogClientProvider;
}

const analytics = new PostHogProductAnalytics(providerWith(recorder));
const errorTracking = new PostHogErrorTracking(providerWith(recorder));

let dataSource: DataSource;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function scene(title: string): void {
  console.log(`\n\n  ── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}\n`);
}

function showCapture(entry: Captured): void {
  console.log(`      event       ${entry.event}`);
  console.log(`      distinct id ${entry.distinctId}`);
  console.log(`      uuid        ${entry.uuid ?? "(none — every occurrence counts)"}`);
  console.log(`      properties  ${JSON.stringify(entry.properties ?? {})}`);
}

// The evaluator is not what this demo is about; it succeeds so the dispatcher
// reaches the capture on its happy path.
const evaluator: ContentEventEvaluator = {
  evaluate: async () => {},
};

async function seedUser(): Promise<void> {
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.query(
    `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)
     ON CONFLICT ("id") DO NOTHING`,
    [USER_ID, "Demo Creator", `${USER_ID}@example.test`],
  );
}

async function cleanUp(): Promise<void> {
  await dataSource.query(`DELETE FROM "content_engine_events" WHERE "userId" = $1`, [USER_ID]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = $1`, [USER_ID]);
  await dataSource.destroy();
}

async function main(): Promise<void> {
  console.log("\n  PostHog product analytics and error tracking");
  console.log("  ============================================");
  console.log("\n  Real services, real database, real redaction. Only the network");
  console.log("  client is a recorder, so every captured event can be shown.");

  scene("1. The region is not left to chance");

  const config = posthogConfig().posthog;
  console.log(`      POSTHOG_HOST unset in this shell, so the host falls back to:`);
  console.log(`      ${config.host}`);
  console.log(
    `      EU default: ${config.host === defaultPostHogHost ? "yes" : "NO — investigate"}`,
  );
  console.log(`\n      capture enabled (a key is configured): ${config.enabled}`);
  console.log("      An absent key disables capture rather than failing startup,");
  console.log("      which is what lets this demo and CI run without a credential.");
  await pause(1200);

  dataSource = new DataSource({
    ...appDataSource.options,
    url: DEMO_DATABASE_URL,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();
  await seedUser();

  const emitter = new ContentEventEmitter();
  const dispatcher = new ContentEventDispatcher(
    dataSource.getRepository(ContentEngineEventEntity),
    evaluator,
    analytics,
  );

  scene("2. A product moment, captured once for all twelve domain events");

  const eventId = contentEventIds.taskCompleted({
    userId: USER_ID,
    programmeId: PROGRAMME_ID,
    taskId: TASK_ID,
    localDate: "2026-08-17",
  });

  await dataSource.transaction((manager) =>
    emitter.emit(manager, {
      eventId,
      eventName: eventNameTokens.taskCompleted,
      payload: {
        userId: USER_ID,
        programmeId: PROGRAMME_ID,
        taskId: TASK_ID,
        contentType: "reel",
      },
    }),
  );

  console.log("      The creator completed a task. The fact is committed to the");
  console.log("      outbox; nothing has been reported yet.\n");
  console.log(`      captured so far: ${captures.length}`);
  await pause(1200);

  await dispatcher.dispatch(eventId);

  console.log("\n      The dispatcher delivered it after commit, and reported it:\n");
  showCapture(captures[0]!);
  console.log("\n      Note the name: the Content Engine's own vocabulary, prefixed.");
  console.log("      All twelve domain events are captured by this one hook, so a");
  console.log("      new event needs no new analytics code.");
  console.log("      Note also what is NOT in the properties: userId. It is already");
  console.log("      the distinct id.");
  await pause(2000);

  scene("3. Delivery is at-least-once, so the same moment cannot count twice");

  console.log("      Redelivering the identical event — a crashed dispatcher, a");
  console.log("      retry, a replay. This is the case that would inflate a funnel.\n");

  // Put the row back to pending, which is exactly the state a crashed dispatch
  // leaves behind.
  await dataSource.query(
    `UPDATE "content_engine_events"
        SET "status" = 'pending', "deliveredAt" = NULL, "availableAt" = now()
      WHERE "id" = $1`,
    [eventId],
  );

  await dispatcher.dispatch(eventId);

  console.log(`      captures recorded: ${captures.length}`);
  console.log(`      uuid on the first:  ${captures[0]?.uuid}`);
  console.log(`      uuid on the second: ${captures[1]?.uuid}`);
  console.log(
    `\n      identical: ${captures[0]?.uuid === captures[1]?.uuid ? "yes" : "NO — investigate"}`,
  );
  console.log("      PostHog drops a repeat of a uuid it has already ingested, so");
  console.log("      the moment is counted once however often it is delivered.");
  console.log("      The uuid is the event's own stable id — nothing was invented.");
  await pause(2000);

  scene("4. Secrets cannot reach the pipeline, even when a call site is careless");

  const before = captures.length;

  analytics.capture({
    identity: { anonymousId: "anon-from-the-browser" },
    event: "login_code_requested",
    properties: {
      intent: "signup",
      // Everything below is what a careless call site might pass. None of it is
      // filtered by the caller — the analytics service does it.
      code: "482913",
      email: "creator@example.test",
      accessToken: "eyJhbGciOi...",
      session: "sid_9f2c",
      countryCode: "GB",
    },
  });

  console.log("      A call site passed a login code, an email and a token:\n");
  showCapture(captures[before]!);
  console.log("\n      Redacted by key, structurally, inside the capture path — so the");
  console.log("      guarantee holds for call sites that do not exist yet.");
  console.log('      "countryCode" survived: over-redaction would make the data useless.');
  await pause(2000);

  scene("5. Failures are reported; refusals are not");

  const request = {
    method: "POST",
    route: { path: "/challenge-setup/complete" },
    user: { id: USER_ID },
    headers: { cookie: "better-auth.session=secret", authorization: "Bearer tok" },
    body: { code: "482913" },
  };

  const host = {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
    }),
  } as unknown as ArgumentsHost;

  // super.catch needs a live http adapter, which a script has no business
  // standing up. The reporting half is what this scene is about.
  const observed = new (class extends UnhandledExceptionFilter {
    protected respond(): void {}
  })(errorTracking);

  observed.catch(new Error("matching service unreachable"), host);

  console.log("      A bug reached the transport layer:\n");
  const failure = exceptions[0]!;
  console.log(`      distinct id ${failure.distinctId}`);
  console.log(`      context     ${JSON.stringify(failure.properties)}`);
  console.log("\n      Route template, method, status, and the user it happened to.");
  console.log("      No cookie, no authorization header, no request body — the context");
  console.log("      shape cannot carry them. $ip is null so the api's own address is");
  console.log("      not geolocated as if it were the user's.");
  await pause(2000);

  const beforeRefusal = exceptions.length;
  observed.catch(new NotFoundException(), host);

  console.log(`\n      Now a 404 — the api working correctly and saying no:`);
  console.log(`      exceptions reported: ${exceptions.length} (was ${beforeRefusal})`);
  console.log("      4xx is not a failure, and reporting it would bury the ones that are.");
  console.log("      Either way the filter hands the response back to Nest untouched,");
  console.log("      so every existing error contract is unchanged.");
  await pause(2000);

  scene("Summary");

  console.log(`  product events captured : ${captures.length}`);
  console.log(`  exceptions captured     : ${exceptions.length}`);
  console.log("\n  Shown here: EU by default, one capture hook for all twelve domain");
  console.log("  events, at-least-once made safe by the event's own id, structural");
  console.log("  redaction, and failures separated from refusals.");
  console.log("\n  Not shown here, because they need a browser:");
  console.log("    · consent gating   — browser analytics stays off until the user agrees");
  console.log("    · identify()       — joins the pre-auth funnel onto the real user");
  console.log("    · client errors    — captured before React hydrates");
  console.log("\n  To prove delivery end to end, add an EU project key:");
  console.log("    api/.env.local   POSTHOG_API_KEY=phc_...");
  console.log("    web/.env.local   NEXT_PUBLIC_POSTHOG_KEY=phc_...");
  console.log("  then run both dev servers, complete a task, and watch PostHog’s");
  console.log("  Activity view in the EU project.\n");

  await cleanUp();
}

main().catch((error: unknown) => {
  console.error("\n  demo failed:", error);
  process.exit(1);
});
