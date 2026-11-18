import { randomUUID } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import { returnedRows } from "../returned-rows";

export const backfillRunStatus = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  refused: "refused",
} as const;

export type BackfillRunStatus =
  (typeof backfillRunStatus)[keyof typeof backfillRunStatus];

// How long a claim may be held before another worker may take it over. Longer
// than the ledger's lease because a single backfill page can be slow, short
// enough that a worker killed by a deploy does not strand the run for a day.
export const RUN_LEASE_MS = 30 * 60 * 1000;

export interface BackfillRunRow {
  id: string;
  ruleId: string;
  status: BackfillRunStatus;
  requestedBy: string | null;
  pageSize: number;
  pauseMs: number;
  maxCandidates: number;
  dryRun: boolean;
  cursor: string | null;
  candidatesScanned: number;
  candidatesFired: number;
  candidatesSkipped: number;
  candidatesFailed: number;
  usersInScope: number | null;
  usersFired: number | null;
  usersSkipped: number;
  usersFailed: number;
  skippedReasons: Record<string, number>;
  failures: { userId: string; stage: string; error: string }[];
  stoppedBecause: string | null;
  refusal: string | null;
  lastError: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ClaimedRun {
  readonly run: BackfillRunRow;
  readonly leaseToken: string;
}

export type BackfillUserOutcomeName = "fired" | "failed" | "skipped";

// A user seen several times in one run settles on the strongest thing that
// happened to them: having fired outranks having failed, which outranks having
// been skipped. Without an order the outcome would be whichever candidate the
// scan happened to reach last.
export const outcomeRanks: Record<BackfillUserOutcomeName, number> = {
  fired: 3,
  failed: 2,
  skipped: 1,
};

export interface BackfillUserOutcome {
  readonly userId: string;
  readonly outcome: BackfillUserOutcomeName;
}

export interface BackfillUserCounts {
  readonly fired: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface BackfillProgress {
  readonly cursor: string | null;
  readonly candidatesScanned: number;
  readonly candidatesFired: number;
  readonly candidatesSkipped: number;
  readonly candidatesFailed: number;
  readonly skippedReasons: Readonly<Record<string, number>>;
  readonly failures: readonly {
    userId: string;
    stage: string;
    error: string;
  }[];
}

const COLUMNS = `
  "id", "ruleId", "status", "requestedBy", "pageSize", "pauseMs",
  "maxCandidates", "dryRun", "cursor", "candidatesScanned", "candidatesFired",
  "candidatesSkipped", "candidatesFailed", "usersInScope", "usersFired",
  "usersSkipped", "usersFailed", "skippedReasons", "failures",
  "stoppedBecause", "refusal", "lastError",
  "createdAt", "startedAt", "finishedAt"
`;

// Claims the oldest queued run, or takes over one whose worker died. The
// SELECT ... FOR UPDATE SKIP LOCKED is what lets two workers run side by side
// without both grabbing the same row: the second skips it rather than blocking.
//
// The lease interval is a build-time constant, so it is inlined rather than
// bound — as a parameter it cost a string concat and an interval parse per
// execution. Interpolation is safe: RUN_LEASE_MS is a number literal.
const CLAIM_SQL = `
  UPDATE "engine_rule_backfill_run"
     SET "status" = 'running',
         "leaseToken" = $1,
         "claimedAt" = now(),
         "updatedAt" = now(),
         "startedAt" = COALESCE("startedAt", now())
   WHERE "id" = (
     SELECT "id" FROM "engine_rule_backfill_run"
      WHERE "status" = 'queued'
         OR ("status" = 'running'
             AND "claimedAt" < now() - interval '${RUN_LEASE_MS} milliseconds')
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING ${COLUMNS}
`;

// Every progress write is fenced on the lease token, so a worker whose claim
// was taken over cannot overwrite the new holder's counters with its own stale
// ones.
const PROGRESS_SQL = `
  UPDATE "engine_rule_backfill_run"
     SET "cursor" = $3,
         "candidatesScanned" = $4,
         "candidatesFired" = $5,
         "candidatesSkipped" = $6,
         "candidatesFailed" = $7,
         "skippedReasons" = $8::jsonb,
         "failures" = $9::jsonb,
         "claimedAt" = now(),
         "updatedAt" = now()
   WHERE "id" = $1 AND "leaseToken" = $2 AND "status" = 'running'
  RETURNING "id"
`;

const FINISH_SQL = `
  UPDATE "engine_rule_backfill_run"
     SET "status" = $3,
         "stoppedBecause" = $4,
         "refusal" = $5,
         "lastError" = $6,
         "usersInScope" = $7,
         "usersFired" = $8,
         "usersSkipped" = $9,
         "usersFailed" = $10,
         "finishedAt" = now(),
         "updatedAt" = now(),
         "leaseToken" = NULL
   WHERE "id" = $1 AND "leaseToken" = $2
  RETURNING ${COLUMNS}
`;

/**
 * The queue and the ledger of on-demand backfill runs.
 *
 * A backfill is requested by a person and then runs for as long as it takes,
 * which is precisely the work that must not live in a request or in one
 * process. The row is the unit of durability: it carries the operator's
 * request, the keyset position reached, the counts so far, and — once it
 * finishes — why it stopped.
 *
 * Claiming is leased and fenced the same way `FiringLedgerService` leases a
 * reservation, for the same reason: a worker that dies must not hold the run
 * forever, and the worker that takes over must not have its progress
 * overwritten by the corpse of the old one.
 */
@Injectable()
export class RuleBackfillRunRepository {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async enqueue(input: {
    ruleId: string;
    requestedBy?: string | null;
    pageSize: number;
    pauseMs: number;
    maxCandidates: number;
    dryRun: boolean;
  }): Promise<BackfillRunRow> {
    try {
      const rows = returnedRows<BackfillRunRow>(
        await this.entityManager.query(
          `INSERT INTO "engine_rule_backfill_run"
             ("ruleId", "requestedBy", "pageSize", "pauseMs", "maxCandidates", "dryRun")
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING ${COLUMNS}`,
          [
            input.ruleId,
            input.requestedBy ?? null,
            input.pageSize,
            input.pauseMs,
            input.maxCandidates,
            input.dryRun,
          ],
        ),
      );

      return rows[0];
    } catch (error) {
      // The partial unique index on (ruleId) WHERE status IN (queued, running).
      // Surfaced as a conflict rather than swallowed: an operator who clicks
      // twice should be told the rollout is already under way, not handed a
      // second run id that will never do anything.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: "BACKFILL_ALREADY_RUNNING",
          message: `A backfill for rule ${input.ruleId} is already queued or running.`,
        });
      }

      throw error;
    }
  }

  async claimNext(): Promise<ClaimedRun | null> {
    const leaseToken = randomUUID();

    const rows = returnedRows<BackfillRunRow>(
      await this.entityManager.query(CLAIM_SQL, [leaseToken]),
    );

    return rows[0] ? { run: rows[0], leaseToken } : null;
  }

  /**
   * Writes a page's worth of progress.
   *
   * Returns false when the lease has been taken over, which the worker reads as
   * "stop": continuing would scan on behalf of a run somebody else now owns.
   */
  async saveProgress(
    id: string,
    leaseToken: string,
    progress: BackfillProgress,
  ): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await this.entityManager.query(PROGRESS_SQL, [
        id,
        leaseToken,
        progress.cursor,
        progress.candidatesScanned,
        progress.candidatesFired,
        progress.candidatesSkipped,
        progress.candidatesFailed,
        JSON.stringify(progress.skippedReasons),
        JSON.stringify(progress.failures),
      ]),
    );

    return rows.length > 0;
  }

  async finish(
    id: string,
    leaseToken: string,
    outcome: {
      status: BackfillRunStatus;
      stoppedBecause?: string | null;
      refusal?: string | null;
      lastError?: string | null;
      usersInScope?: number | null;
      usersFired?: number | null;
      usersSkipped?: number;
      usersFailed?: number;
    },
  ): Promise<BackfillRunRow | null> {
    const rows = returnedRows<BackfillRunRow>(
      await this.entityManager.query(FINISH_SQL, [
        id,
        leaseToken,
        outcome.status,
        outcome.stoppedBecause ?? null,
        outcome.refusal ?? null,
        outcome.lastError ?? null,
        outcome.usersInScope ?? null,
        outcome.usersFired ?? null,
        outcome.usersSkipped ?? 0,
        outcome.usersFailed ?? 0,
      ]),
    );

    return rows[0] ?? null;
  }

  /**
   * Hands a run back to the queue with its progress intact.
   *
   * A run that spends its per-claim budget is not finished and is not failed —
   * it has more to do and has yielded so other queued runs get a turn. Marking
   * it `succeeded` would strand the rest of the rollout behind an operator
   * noticing and asking again.
   */
  async requeue(
    id: string,
    leaseToken: string,
    counts: {
      usersInScope: number;
      usersFired: number;
      usersSkipped: number;
      usersFailed: number;
    },
  ): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await this.entityManager.query(
        `UPDATE "engine_rule_backfill_run"
            SET "status" = 'queued',
                "stoppedBecause" = 'work_limit',
                "usersInScope" = $3,
                "usersFired" = $4,
                "usersSkipped" = $5,
                "usersFailed" = $6,
                "leaseToken" = NULL,
                "claimedAt" = NULL,
                "updatedAt" = now()
          WHERE "id" = $1 AND "leaseToken" = $2
         RETURNING "id"`,
        [
          id,
          leaseToken,
          counts.usersInScope,
          counts.usersFired,
          counts.usersSkipped,
          counts.usersFailed,
        ],
      ),
    );

    return rows.length > 0;
  }

  async findById(id: string): Promise<BackfillRunRow | null> {
    const rows = returnedRows<BackfillRunRow>(
      await this.entityManager.query(
        `SELECT ${COLUMNS} FROM "engine_rule_backfill_run" WHERE "id" = $1`,
        [id],
      ),
    );

    return rows[0] ?? null;
  }

  async listRecent(ruleId?: string, limit = 25): Promise<BackfillRunRow[]> {
    const filter = ruleId ? `WHERE "ruleId" = $2` : "";

    return returnedRows<BackfillRunRow>(
      await this.entityManager.query(
        `SELECT ${COLUMNS} FROM "engine_rule_backfill_run"
         ${filter}
         ORDER BY "createdAt" DESC
         LIMIT $1`,
        ruleId ? [limit, ruleId] : [limit],
      ),
    );
  }

  /**
   * Records what happened to a page's worth of users.
   *
   * One statement per page, not per candidate. A user can appear more than once
   * in a run — several completed programmes, several follower tiers — so the
   * upsert keeps the strongest outcome rather than the last one written:
   * a user who fired on one candidate and was skipped on the next fired.
   */
  async recordUserOutcomes(
    runId: string,
    outcomes: readonly BackfillUserOutcome[],
  ): Promise<void> {
    if (outcomes.length === 0) {
      return;
    }

    // Deduplicated in memory first so one statement cannot hit the same
    // (runId, userId) twice — Postgres refuses to update a row a second time
    // within a single ON CONFLICT statement.
    const strongest = new Map<string, BackfillUserOutcome>();

    for (const outcome of outcomes) {
      const held = strongest.get(outcome.userId);

      if (!held || outcomeRanks[outcome.outcome] > outcomeRanks[held.outcome]) {
        strongest.set(outcome.userId, outcome);
      }
    }

    const rows = [...strongest.values()];
    const values = rows
      .map(
        (_, index) =>
          `($1, $${index * 3 + 2}, $${index * 3 + 3}, $${index * 3 + 4})`,
      )
      .join(", ");

    await this.entityManager.query(
      `INSERT INTO "engine_rule_backfill_run_user"
         ("runId", "userId", "outcome", "outcomeRank")
       VALUES ${values}
       ON CONFLICT ("runId", "userId") DO UPDATE
         SET "outcome" = EXCLUDED."outcome",
             "outcomeRank" = EXCLUDED."outcomeRank",
             "updatedAt" = now()
       WHERE EXCLUDED."outcomeRank" > "engine_rule_backfill_run_user"."outcomeRank"`,
      [
        runId,
        ...rows.flatMap((row) => [
          row.userId,
          row.outcome,
          outcomeRanks[row.outcome],
        ]),
      ],
    );
  }

  /**
   * Distinct users this run reached, by outcome.
   *
   * Scoped to the run, which the firing ledger cannot do: the ledger records
   * that a rule fired for a user, never which rollout caused it, so counting it
   * would fold in everyone who fired live beforehand and everyone an earlier
   * run reached. Read as rows rather than tallied in the worker, so an
   * interrupted run reports the same numbers a single pass would.
   */
  async countUsersByOutcome(runId: string): Promise<BackfillUserCounts> {
    const rows = returnedRows<{ outcome: string; count: string }>(
      await this.entityManager.query(
        `SELECT "outcome", COUNT(*) AS "count"
           FROM "engine_rule_backfill_run_user"
          WHERE "runId" = $1
          GROUP BY "outcome"`,
        [runId],
      ),
    );

    const counts = new Map(rows.map((row) => [row.outcome, Number(row.count)]));

    return {
      fired: counts.get("fired") ?? 0,
      failed: counts.get("failed") ?? 0,
      skipped: counts.get("skipped") ?? 0,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}
