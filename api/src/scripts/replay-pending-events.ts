import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import type { DispatchResult } from "../content-engine/event-dispatcher";

/**
 * Drains the Content Engine outbox backlog in bounded batches.
 *
 * Events accumulate as `pending` whenever no evaluator can deliver them — most
 * of the backlog this exists for built up while the placeholder evaluator was
 * bound and every delivery threw on purpose. Nothing calls `dispatchPending()`
 * on a schedule, so the backlog is drained deliberately, by an operator
 * watching it, rather than by a worker that might stampede a freshly activated
 * evaluator.
 *
 * Safe to re-run and safe to stop: every event goes through the same claim,
 * ledger reservation and dedupe path as a live delivery, so a replayed event
 * cannot fire a rule that already fired.
 *
 *   yarn workspace @contentual/api replay:pending -- --batch 25 --max 500
 *   yarn workspace @contentual/api replay:pending -- --dry-run
 */

interface Options {
  batchSize: number;
  maxEvents: number;
  dryRun: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const positive = (raw: string | undefined, fallback: number): number => {
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    // Matches dispatchPending()'s own default. Small batches keep each pass
    // short so an operator can stop between them.
    batchSize: positive(value("--batch"), 25),
    maxEvents: positive(value("--max"), 500),
    dryRun: argv.includes("--dry-run"),
  };
}

function summarise(results: readonly DispatchResult[]) {
  const delivered = results.filter((result) => result.delivered).length;
  const failed = results.length - delivered;
  const reasons = new Map<string, number>();

  for (const result of results) {
    if (!result.delivered && result.reason) {
      reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
    }
  }

  return { delivered, failed, reasons };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  // A full application context, so the replay runs through exactly the
  // providers production uses — the real evaluator, the real effect handlers
  // and the real ledger. A hand-rolled data source here could drift from them.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const dispatcher = app.get(ContentEventDispatcher);

    if (options.dryRun) {
      console.log(
        `[replay] dry run: would drain up to ${options.maxEvents} events in batches of ${options.batchSize}`,
      );
      return;
    }

    let processed = 0;
    let delivered = 0;
    let failed = 0;

    while (processed < options.maxEvents) {
      const remaining = options.maxEvents - processed;
      const limit = Math.min(options.batchSize, remaining);
      const results = await dispatcher.dispatchPending(limit);

      // An empty batch means the backlog is drained, or everything left is
      // backing off and not yet due. Either way there is nothing to do now.
      if (results.length === 0) {
        console.log("[replay] no further events are currently available");
        break;
      }

      const batch = summarise(results);
      processed += results.length;
      delivered += batch.delivered;
      failed += batch.failed;

      const detail = [...batch.reasons.entries()]
        .map(([reason, count]) => `${reason}=${count}`)
        .join(" ");

      console.log(
        `[replay] batch of ${results.length}: delivered=${batch.delivered} failed=${batch.failed}${detail ? ` (${detail})` : ""}`,
      );
    }

    console.log(
      `[replay] finished: processed=${processed} delivered=${delivered} failed=${failed}`,
    );

    // A failure here is a report, not a crash: the rows stayed pending with
    // their backoff and the next run picks them up.
    if (failed > 0) {
      console.log(
        "[replay] failed events remain pending and will be retried; check PostHog for per-rule detail",
      );
    }
  } finally {
    // Closing runs the shutdown hooks, which flush queued PostHog events.
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[replay] aborted:", error);
  process.exitCode = 1;
});
