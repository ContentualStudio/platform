import "reflect-metadata";
import { DataSource } from "typeorm";
import { dedupeScopeTokens } from "@contentual/content-engine-vocabulary";
import appDataSource from "../database/data-source";
import { FiringLedgerService, LEASE_MS } from "../content-engine/firing-ledger.service";
import type { FiringContext } from "../content-engine/dedupe-scope-key";

// Narrated walkthrough of the Content Engine firing ledger, for demoing the
// ticket. It runs real SQL against a real database and prints what the engine
// would have done — every "AWARDED" line is an effect that actually ran, every
// "suppressed" line is one the ledger refused.
//
//   DEMO_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_test \
//     yarn workspace @contentual/api demo:firing-ledger
//
// Defaults to the local contentual_test database. It seeds its own user, cleans
// up after itself, and never touches application data.

const DEMO_DATABASE_URL =
  process.env.DEMO_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/contentual_test";

const USER = "demo-creator";
const OTHER_USER = "demo-other-creator";

let dataSource: DataSource;
let ledger: FiringLedgerService;
let effectsRun = 0;

function scene(title: string): void {
  console.log(`\n${"─".repeat(72)}\n  ${title}\n${"─".repeat(72)}`);
}

function step(text: string): void {
  console.log(`\n  ${text}`);
}

async function pause(ms = 900): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Stands in for a real effect handler (award_badge, prompt_call, ...). The
// whole point of the ledger is that this line cannot print twice for a rule
// that is only allowed to fire once.
function runEffect(label: string): void {
  effectsRun += 1;
  console.log(`      ✅  EFFECT RAN  →  ${label}`);
}

// The evaluator's gate, in miniature: reserve, and only act on a fresh
// reservation. This is exactly the sequence ticket 5 will follow.
async function evaluate(label: string, context: FiringContext): Promise<void> {
  const reservation = await ledger.reserve(context);

  if (!reservation.fresh) {
    console.log(`      🚫  suppressed by ledger  (${reservation.reason})`);
    return;
  }

  runEffect(label);
  await ledger.markFired(context.userId, reservation.ledgerId, reservation.leaseToken);
}

async function showLedger(): Promise<void> {
  const rows = await dataSource.query(
    `SELECT "ruleId", "userId", "scopeKey", "status", "attemptCount", "eventRef"
       FROM "engine_firing_ledger" ORDER BY "id"`,
  );
  console.log("\n      engine_firing_ledger:");
  console.table(rows);
}

async function main(): Promise<void> {
  dataSource = new DataSource({
    ...appDataSource.options,
    url: DEMO_DATABASE_URL,
    logging: false,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();
  ledger = new FiringLedgerService(dataSource.manager);

  for (const id of [USER, OTHER_USER]) {
    await dataSource.query(
      `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)
       ON CONFLICT ("id") DO NOTHING`,
      [id, id, `${id}@example.test`],
    );
  }
  await dataSource.query(`DELETE FROM "engine_firing_ledger" WHERE "userId" = ANY($1)`, [
    [USER, OTHER_USER],
  ]);

  console.log(`\n  Content Engine — firing ledger demo`);
  console.log(`  database: ${DEMO_DATABASE_URL}`);

  // ── 1 ────────────────────────────────────────────────────────────────────
  scene("1. once_per_user — a replayed event cannot award a second badge");

  const firstBadge: FiringContext = {
    ruleId: "rule.first-post-badge",
    userId: USER,
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "evt-1001",
  };

  step("task.completed arrives (evt-1001):");
  await evaluate("award_badge → First Post", firstBadge);
  await pause();

  step("the SAME event is replayed — queue retry, at-least-once delivery:");
  await evaluate("award_badge → First Post", firstBadge);
  await pause();

  step("a DIFFERENT event hits the same once_per_user rule (evt-1002):");
  await evaluate("award_badge → First Post", { ...firstBadge, eventId: "evt-1002" });

  await showLedger();
  console.log("      ↑ one row. Scope key is a constant, so the rule is spent for this user.");
  await pause(1500);

  // ── 2 ────────────────────────────────────────────────────────────────────
  scene("2. A double cron run — 8 workers race for the same firing");

  const streakRule: FiringContext = {
    ruleId: "rule.streak-7",
    userId: USER,
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "evt-cron",
  };

  step("8 concurrent reserve() calls, all for the same (rule, user, scope):");
  const results = await Promise.all(
    Array.from({ length: 8 }, () => ledger.reserve(streakRule)),
  );
  const winners = results.filter((result) => result.fresh);
  for (const winner of winners) {
    runEffect("award_badge → 7 Day Streak");
    await ledger.markFired(USER, winner.ledgerId, winner.leaseToken);
  }
  console.log(`      winners: ${winners.length}   blocked: ${results.length - winners.length}`);
  console.log("      ↑ the unique index picked exactly one. No coordination, no locks in app code.");
  await pause(1500);

  // ── 3 ────────────────────────────────────────────────────────────────────
  scene("3. once_per_user_per_programme — once per programme, not once ever");

  const perProgramme = {
    ruleId: "rule.programme-welcome",
    userId: USER,
    dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
  } satisfies Partial<FiringContext>;

  step("programme A starts:");
  await evaluate("in-app-message → Welcome to A", {
    ...perProgramme,
    programmeId: "programme-A",
    eventId: "evt-2001",
  });

  step("programme A starts again (user re-enrols):");
  await evaluate("in-app-message → Welcome to A", {
    ...perProgramme,
    programmeId: "programme-A",
    eventId: "evt-2002",
  });

  step("programme B starts — a genuinely different firing:");
  await evaluate("in-app-message → Welcome to B", {
    ...perProgramme,
    programmeId: "programme-B",
    eventId: "evt-2003",
  });
  await pause(1500);

  // ── 4 ────────────────────────────────────────────────────────────────────
  scene("4. every_time — fires on every qualifying event, by design");

  for (const eventId of ["evt-3001", "evt-3002", "evt-3003"]) {
    step(`task.completed (${eventId}):`);
    await evaluate("prompt_call → nudge", {
      ruleId: "rule.every-completion",
      userId: USER,
      dedupeScope: dedupeScopeTokens.everyTime,
      eventId,
    });
  }
  console.log("\n      ↑ scope key is the event id, so each event reserves its own row.");
  await pause(1500);

  // ── 5 ────────────────────────────────────────────────────────────────────
  scene("5. A crashed effect — retried, but never duplicated");

  const flaky: FiringContext = {
    ruleId: "rule.flaky-effect",
    userId: USER,
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "evt-4001",
  };

  step("worker reserves, then the effect throws before completing:");
  const crashed = await ledger.reserve(flaky);
  if (!crashed.fresh) throw new Error("demo precondition failed");
  console.log("      💥  effect threw — row stays reserved, never marked fired");

  step("an immediate retry: the lease is still held, so nothing runs twice:");
  await evaluate("award_badge → Comeback", flaky);

  step(`the lease expires (${LEASE_MS / 60000} min later — backdated here to keep the demo short):`);
  await dataSource.query(
    `UPDATE "engine_firing_ledger"
        SET "reservedAt" = now() - interval '1 hour'
      WHERE "ruleId" = $1 AND "userId" = $2`,
    [flaky.ruleId, USER],
  );
  const retry = await ledger.reserve(flaky);
  if (!retry.fresh) throw new Error("demo precondition failed");
  console.log(`      ♻️   reclaimed — attempt ${retry.attempt}, new lease token`);

  step("the ORIGINAL crashed worker wakes up late and tries to complete:");
  const fenced = await ledger.markFired(USER, crashed.ledgerId, crashed.leaseToken);
  console.log(`      🚫  rejected — ${fenced.marked ? "marked" : fenced.reason}`);
  console.log("      ↑ the fencing token stops a zombie worker completing someone else's firing.");

  step("the current holder completes normally:");
  runEffect("award_badge → Comeback");
  await ledger.markFired(USER, retry.ledgerId, retry.leaseToken);
  await pause(1500);

  // ── 6 ────────────────────────────────────────────────────────────────────
  scene("6. Per-user isolation — one user's ledger never gates another's");

  step("a DIFFERENT user hits the rule that is already spent for demo-creator:");
  await evaluate("award_badge → First Post", { ...firstBadge, userId: OTHER_USER });

  await showLedger();

  scene("Summary");
  console.log(`  effects that actually ran: ${effectsRun}`);
  console.log("  every suppression above was the ledger, not application logic.\n");

  await dataSource.query(`DELETE FROM "engine_firing_ledger" WHERE "userId" = ANY($1)`, [
    [USER, OTHER_USER],
  ]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [[USER, OTHER_USER]]);
  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error("\n  demo failed:", error);
  process.exit(1);
});
