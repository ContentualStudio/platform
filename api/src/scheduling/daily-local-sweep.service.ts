import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import { scrubText } from "../observability/scrub-secrets";
import { SWEEP_JOBS, type SweepJob } from "./sweep-job.port";

/**
 * Serves each user their daily work at roughly 7am local time.
 *
 * Two steps per tick, both safe to run concurrently on any number of replicas:
 *
 *   1. **Enqueue.** One statement inserts a row for every user whose local
 *      clock has passed the hour and who has no row for their local date yet.
 *      The unique index makes a duplicate insert lose rather than raise, so the
 *      tick rate is irrelevant to correctness.
 *   2. **Claim and run.** `FOR UPDATE SKIP LOCKED` with a fencing token, the
 *      same shape `engine_rule_backfill_run` uses: a second worker takes a
 *      different row, and a row whose worker died is taken over once its lease
 *      expires rather than being stranded.
 */

// How long a claim is honoured before another worker may take it over. Long
// enough for a slow Graph call, short enough that a crashed replica's work is
// picked up the same morning.
const CLAIM_LEASE_MS = 5 * 60_000;

// Backoff before a failed run is offered again. The real retry is tomorrow's
// sweep; this only covers a transient blip within the same morning.
const RETRY_BACKOFF_MS = 15 * 60_000;

export interface SweepSummary {
  readonly jobName: string;
  readonly claimed: number;
  readonly succeeded: number;
  readonly skipped: number;
  readonly failed: number;
}

/**
 * Enqueues one row per eligible user for their current local date.
 *
 * The timezone join is the load-bearing part. `user_profile.timezone` is free
 * text, and passing an unrecognised name to `AT TIME ZONE` raises — which would
 * fail the whole statement and stop the sweep for everybody because of one bad
 * row. Joining `pg_timezone_names` and falling back to UTC degrades that single
 * user instead.
 */
function enqueueSql(scopeSql: string): string {
  return `
    INSERT INTO "daily_local_sweep_run" ("jobName", "userId", "localDate")
    SELECT $1,
           p."userId",
           (now() AT TIME ZONE COALESCE(tz."name", 'UTC'))::date
      FROM "user_profile" p
      LEFT JOIN pg_timezone_names tz ON tz."name" = p."timezone"
     WHERE extract(
             hour FROM (now() AT TIME ZONE COALESCE(tz."name", 'UTC'))
           ) >= $2
       AND (${scopeSql})
       AND NOT EXISTS (
             SELECT 1
               FROM "daily_local_sweep_run" r
              WHERE r."jobName" = $1
                AND r."userId" = p."userId"
                AND r."localDate" =
                    (now() AT TIME ZONE COALESCE(tz."name", 'UTC'))::date
           )
    ON CONFLICT ("jobName", "userId", "localDate") DO NOTHING
  `;
}

// The lease interval is a build-time constant, inlined rather than bound for
// the same reason the backfill repository inlines its own: as a parameter it
// costs a string concat and an interval parse per execution.
//
// Failed runs are claimable too: the failure path parks them at
// availableAt = now() + backoff, and the outer availableAt gate above is what
// holds them for the backoff window. Without this branch a transient failure
// would strand the user-day permanently — nothing else ever re-offers it.
const CLAIM_SQL = `
  UPDATE "daily_local_sweep_run"
     SET "status" = 'running',
         "leaseToken" = $2,
         "claimedAt" = now(),
         "attemptCount" = "attemptCount" + 1
   WHERE "id" = (
     SELECT "id" FROM "daily_local_sweep_run"
      WHERE "jobName" = $1
        AND "availableAt" <= now()
        AND ("status" = 'due'
             OR ("status" = 'running'
                 AND "claimedAt" < now() - interval '${CLAIM_LEASE_MS} milliseconds')
             OR ("status" = 'failed'))
      ORDER BY "availableAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING "id", "userId", "localDate"
`;

// Fenced on the lease token: a worker whose claim was taken over cannot report
// on the new holder's run.
const FINISH_SQL = `
  UPDATE "daily_local_sweep_run"
     SET "status" = $3, "finishedAt" = now(), "lastError" = NULL
   WHERE "id" = $1 AND "leaseToken" = $2
`;

const FAIL_SQL = `
  UPDATE "daily_local_sweep_run"
     SET "status" = 'failed',
         "lastError" = $3,
         "availableAt" = now() + interval '${RETRY_BACKOFF_MS} milliseconds'
   WHERE "id" = $1 AND "leaseToken" = $2
`;

@Injectable()
export class DailyLocalSweepService {
  private readonly logger = new Logger(DailyLocalSweepService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @Inject(SWEEP_JOBS) private readonly jobs: SweepJob[] = [],
  ) {}

  /**
   * One pass: enqueue what is now due, then drain up to `maxRuns` per job.
   *
   * Never throws. A sweep that took the process down over one user's bad data
   * would deny everybody else their morning.
   */
  async tick(localHour: number, maxRuns = 25): Promise<SweepSummary[]> {
    const summaries: SweepSummary[] = [];

    for (const job of this.jobs) {
      try {
        await this.dataSource.query(enqueueSql(job.scopeSql), [
          job.name,
          localHour,
        ]);
      } catch (error) {
        this.logger.error(
          `Sweep enqueue failed for ${job.name}: ${describe(error)}`,
        );
        continue;
      }

      summaries.push(await this.drain(job, maxRuns));
    }

    return summaries;
  }

  private async drain(job: SweepJob, maxRuns: number): Promise<SweepSummary> {
    let claimed = 0;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < maxRuns; index += 1) {
      const leaseToken = randomUUID();

      const [run] = returnedRows<{
        id: string;
        userId: string;
        localDate: string;
      }>(await this.dataSource.query(CLAIM_SQL, [job.name, leaseToken]));

      if (!run) {
        break;
      }

      claimed += 1;

      try {
        const outcome = await job.run(run.userId, String(run.localDate));

        await this.dataSource.query(FINISH_SQL, [run.id, leaseToken, outcome]);
        if (outcome === "skipped") {
          skipped += 1;
        } else {
          succeeded += 1;
        }
      } catch (error) {
        // Isolated per user: one person's dead token or bad data must not stop
        // the rest of the morning.
        failed += 1;
        await this.dataSource.query(FAIL_SQL, [
          run.id,
          leaseToken,
          scrubText(describe(error)).slice(0, 1_000),
        ]);
        this.logger.warn(
          `Sweep job ${job.name} failed for one user: ${scrubText(describe(error))}`,
        );
      }
    }

    return { jobName: job.name, claimed, succeeded, skipped, failed };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
