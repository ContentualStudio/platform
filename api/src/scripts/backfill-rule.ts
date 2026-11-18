import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import {
  BackfillRefusedError,
  RuleBackfillService,
  type RuleBackfillSummary,
} from "../content-engine/backfill/rule-backfill.service";

/**
 * Enqueues and/or works off on-demand rule backfills.
 *
 * Firing is forward-only: activating a rule in the CMS fires it on subsequent
 * events and replays nothing. This is the deliberate catch-up.
 *
 * The work itself lives in `engine_rule_backfill_run`, not in this process. The
 * script is one of two front doors onto that queue — the other is
 * `POST /admin/content-engine/backfills`, which the admin engine view drives.
 * Either way a run survives this process dying: a worker resumes it from the
 * keyset cursor it last wrote.
 *
 *   # queue a rollout and work it off here
 *   yarn workspace @contentual/api backfill:rule -- --rule <id> --dry-run
 *   yarn workspace @contentual/api backfill:rule -- --rule <id>
 *
 *   # queue only; a worker elsewhere picks it up
 *   yarn workspace @contentual/api backfill:rule -- --rule <id> --queue-only
 *
 *   # work off whatever the admin view queued
 *   yarn workspace @contentual/api backfill:worker
 *
 * A run stopped by its work limit reports `hasMore`. Re-running continues from
 * where it stopped — the limit counts only candidates that were not already
 * fired, so a rerun always makes forward progress rather than spending its
 * budget re-skipping the users the last run handled.
 */

interface Options {
  ruleId: string | null;
  pageSize?: number;
  pauseMs?: number;
  maxCandidates?: number;
  dryRun: boolean;
  queueOnly: boolean;
  workerOnly: boolean;
  maxRuns: number;
}

function parseOptions(argv: readonly string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const number = (raw: string | undefined): number | undefined => {
    const parsed = Number(raw);
    return raw !== undefined && Number.isInteger(parsed) ? parsed : undefined;
  };

  return {
    ruleId: value("--rule")?.trim() || null,
    pageSize: number(value("--page")),
    pauseMs: number(value("--pause")),
    maxCandidates: number(value("--max")),
    dryRun: argv.includes("--dry-run"),
    queueOnly: argv.includes("--queue-only"),
    workerOnly: argv.includes("--worker"),
    maxRuns: number(value("--max-runs")) ?? 10,
  };
}

function report(summary: RuleBackfillSummary): void {
  console.log(
    `[backfill] run=${summary.runId} rule=${summary.ruleId} event=${summary.eventName}`,
  );
  console.log(
    `[backfill]   users:      inScope=${summary.usersInScope} fired=${summary.usersFired}`,
  );
  console.log(
    `[backfill]   candidates: scanned=${summary.candidatesScanned} ` +
      `fired=${summary.candidatesFired} skipped=${summary.candidatesSkipped} ` +
      `failed=${summary.candidatesFailed}`,
  );

  const reasons = Object.entries(summary.skippedReasons)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");

  if (reasons) {
    console.log(`[backfill]   skipped:    ${reasons}`);
  }

  for (const failure of summary.failures) {
    console.log(
      `[backfill]   failed user=${failure.userId} stage=${failure.stage}: ${failure.error}`,
    );
  }

  console.log(`[backfill]   stopped:    ${summary.stoppedBecause}`);

  if (summary.resumeCursor !== null) {
    console.log(
      "[backfill]   more remains; re-run to continue from where this stopped",
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  // This process *is* the worker for the duration of the run. Leaving the
  // in-application worker enabled would have two consumers in one process
  // racing for the same claim — harmless, since claiming is leased and
  // skip-locked, but it would make the script's own output miss runs it
  // reported nothing about.
  process.env.CONTENT_ENGINE_BACKFILL_WORKER = "false";

  if (!options.ruleId && !options.workerOnly) {
    console.error(
      "[backfill] --rule <sourceDocumentId> is required (or --worker to drain the queue)",
    );
    process.exitCode = 1;
    return;
  }

  // A full application context, so the rollout runs through exactly the
  // providers production uses — the real rule mirror, the real ledger and the
  // real effect handlers.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const backfills = app.get(RuleBackfillService);

    if (options.ruleId) {
      try {
        const run = await backfills.enqueue(options.ruleId, {
          pageSize: options.pageSize,
          pauseMs: options.pauseMs,
          maxCandidates: options.maxCandidates,
          dryRun: options.dryRun,
          requestedBy: "backfill:rule script",
        });

        console.log(`[backfill] queued run ${run.id} for rule ${run.ruleId}`);
      } catch (error) {
        if (error instanceof BackfillRefusedError) {
          console.error(`[backfill] refused: ${error.message}`);
          process.exitCode = 1;
          return;
        }

        throw error;
      }

      if (options.queueOnly) {
        console.log("[backfill] queued only; a worker will pick it up");
        return;
      }
    }

    const summaries = await backfills.processQueued(options.maxRuns);

    if (summaries.length === 0) {
      console.log("[backfill] no runs were available to work off");
      return;
    }

    for (const summary of summaries) {
      report(summary);
    }

    // A report, not a crash. The rule fired for everyone it could; the run row
    // holds the detail and re-running skips everyone who already fired.
    if (summaries.some((summary) => summary.candidatesFailed > 0)) {
      console.log(
        "[backfill] some candidates failed; re-running skips everyone who already fired",
      );
    }
  } finally {
    // Closing runs the shutdown hooks, which flush queued PostHog events.
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[backfill] aborted:", error);
  process.exitCode = 1;
});
