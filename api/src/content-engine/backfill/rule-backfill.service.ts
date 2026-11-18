import { setTimeout as delay } from "node:timers/promises";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import { conditionSourceTokens } from "@contentual/content-engine-vocabulary";
import type { EventName } from "@contentual/content-engine-vocabulary";
import { EngineRuleRepository } from "../engine-rule.repository";
import type { RuntimeEngineRule } from "../engine-rule";
import {
  RULE_EVALUATION_OBSERVER,
  type RuleEvaluationObserver,
  type RuleEvaluationStage,
} from "../rule-evaluation-observer.port";
import { RuleFiringService } from "../rule-firing.service";
import { UserAttributeReaderFactory } from "../user-attribute.reader";
import { backfillScannerFor, backfillUnsupportedReason } from "./backfill-scanners";
import {
  backfillRunStatus,
  RuleBackfillRunRepository,
  type BackfillRunRow,
  type BackfillUserOutcome,
} from "./rule-backfill-run.repository";

// Deliberately modest. A backfill competes with live traffic on the same
// Postgres, and it is an operator action with no deadline — there is nothing to
// win by finishing in one minute instead of ten, and a scan that degrades the
// app for real users is a worse outcome than a slow one.
export const backfillDefaults = {
  pageSize: 200,
  pauseMs: 200,
  maxCandidates: 100_000,
} as const;

export interface RuleBackfillOptions {
  readonly pageSize?: number;
  readonly pauseMs?: number;
  readonly maxCandidates?: number;
  // Reports what the run would do without reserving or firing anything.
  readonly dryRun?: boolean;
  readonly requestedBy?: string | null;
}

export type BackfillRefusalReason =
  | "rule_not_found"
  | "rule_inactive"
  | "rule_invalid"
  | "unsupported_event"
  | "unreconstructible_condition";

export interface BackfillRefusal {
  readonly reason: BackfillRefusalReason;
  readonly detail?: string;
}

// A rollout that cannot be attempted at all. Thrown rather than returned so a
// caller cannot mistake it for a run that was accepted — the admin endpoint
// turns it into a 422, and the CLI prints it and exits non-zero.
export class BackfillRefusedError extends Error {
  constructor(readonly refusal: BackfillRefusal) {
    super(
      refusal.detail
        ? `${refusal.reason}: ${refusal.detail}`
        : refusal.reason,
    );
    this.name = "BackfillRefusedError";
  }
}

export interface RuleBackfillFailure {
  readonly userId: string;
  readonly stage: RuleEvaluationStage;
  readonly error: string;
}

export interface RuleBackfillSummary {
  readonly runId: string;
  readonly ruleId: string;
  readonly eventName: EventName;

  /**
   * Users, which is what the acceptance criteria ask for, and scoped to *this*
   * rollout.
   *
   * `usersInScope` is a `COUNT(DISTINCT "userId")` over the scan's own
   * predicate. The other three come from the run's own per-user rows, not from
   * the firing ledger: the ledger records that a rule fired for a user, never
   * which rollout caused it, so reading it would fold in everyone who fired
   * live beforehand and everyone an earlier run reached — and could report more
   * users fired than this run had candidates.
   *
   * All four are queries rather than tallies accumulated in the worker, so a
   * run resumed after a crash reports the same numbers a single pass would, and
   * none of them grows with the size of the user base.
   */
  readonly usersInScope: number;
  readonly usersFired: number;
  readonly usersSkipped: number;
  readonly usersFailed: number;

  /**
   * Candidates, which is what the scan is actually expressed in. A per-record
   * family (`programme.completed`, `task.completed`) produces one candidate per
   * stored fact and `follower.milestone` one per tier cleared, so these do not
   * equal the user counts above and are reported separately rather than
   * conflated with them.
   */
  readonly candidatesScanned: number;
  readonly candidatesFired: number;
  readonly candidatesSkipped: number;
  readonly candidatesFailed: number;

  readonly skippedReasons: Readonly<Record<string, number>>;
  readonly failures: readonly RuleBackfillFailure[];
  readonly stoppedBecause: "exhausted" | "work_limit" | "dry_run" | "lease_lost";
  /** Where a limited run stopped, so the next one resumes instead of rescanning. */
  readonly resumeCursor: string | null;
}

// Enough to see a pattern in a failing run, few enough that a backfill against
// a broken effect handler does not store a megabyte of identical strings. The
// per-rule error observations carry the rest.
const MAX_REPORTED_FAILURES = 25;

function positive(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : fallback;
}

// Zero is a legitimate pause — an operator running against a quiet replica has
// nothing to throttle for — so this cannot share the guard above.
function nonNegative(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rolls one already-authored rule out to the users whose current state already
 * satisfies it.
 *
 * Firing is forward-only by default, and nothing here changes that: activating
 * a rule replays nothing, and this runs only when an operator asks for it, for
 * one rule they name.
 *
 * The rollout is not a replay of history. No outbox row is written and no past
 * event is reconstructed — a scanner reads what is true *now* and the rule is
 * asked about that. A user whose 30-day streak has since lapsed is not a
 * candidate, because the scanner's predicate excludes them.
 *
 * Safety comes from the firing ledger rather than from bookkeeping here. Every
 * candidate goes through RuleFiringService — the same conditions, the same
 * dedupe key, the same reservation the live evaluator uses — so a user who
 * already fired the rule, live or in a previous run, collides on the unique
 * index and is skipped.
 *
 * Requests are queued, not executed inline: `enqueue()` records the operator's
 * intent durably and returns, and `processQueued()` — a worker — claims runs
 * and scans them. A disconnect, a deploy or a crash therefore costs at most one
 * page of progress rather than the whole rollout.
 */
@Injectable()
export class RuleBackfillService {
  private readonly logger = new Logger(RuleBackfillService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly rules: EngineRuleRepository,
    private readonly runs: RuleBackfillRunRepository,
    private readonly userAttributes: UserAttributeReaderFactory,
    private readonly firing: RuleFiringService,
    @Inject(RULE_EVALUATION_OBSERVER)
    private readonly observer: RuleEvaluationObserver,
  ) {}

  /**
   * Records a rollout request and returns immediately.
   *
   * The rule is checked before the row is written, while somebody is watching,
   * so an operator who names a rule that does not exist or is switched off is
   * told at the point of asking rather than having to come back later to find
   * out why nothing happened. Nothing is enqueued in that case — a queued run
   * that can only ever be refused is noise in the queue and holds the rule's
   * one live-run slot against a corrected retry.
   *
   * The check is repeated when a worker picks the run up, because a rule can be
   * deactivated or edited in between; that refusal *is* persisted, since by
   * then the request was legitimately accepted.
   */
  async enqueue(
    ruleId: string,
    options: RuleBackfillOptions = {},
  ): Promise<BackfillRunRow> {
    const refusal = await this.refusalFor(ruleId);

    if (refusal) {
      throw new BackfillRefusedError(refusal);
    }

    return this.runs.enqueue({
      ruleId,
      requestedBy: options.requestedBy,
      pageSize: positive(options.pageSize, backfillDefaults.pageSize),
      pauseMs: nonNegative(options.pauseMs, backfillDefaults.pauseMs),
      maxCandidates: positive(
        options.maxCandidates,
        backfillDefaults.maxCandidates,
      ),
      dryRun: options.dryRun ?? false,
    });
  }

  /**
   * Claims and scans queued runs, oldest first, until there are none left.
   *
   * Returns one summary per run it completed. Safe to run in more than one
   * process: claiming uses `FOR UPDATE SKIP LOCKED`, so a second worker takes
   * the next run rather than blocking on this one.
   */
  async processQueued(maxRuns = 10): Promise<RuleBackfillSummary[]> {
    const summaries: RuleBackfillSummary[] = [];

    for (let processed = 0; processed < maxRuns; processed += 1) {
      const claimed = await this.runs.claimNext();

      if (!claimed) {
        break;
      }

      const summary = await this.execute(claimed.run, claimed.leaseToken);

      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  private async refusalFor(ruleId: string): Promise<BackfillRefusal | null> {
    const lookup = await this.rules.findById(ruleId);

    if (!lookup.found) {
      return { reason: "rule_not_found" };
    }

    // An inactive rule is refused rather than backfilled. Rolling one out would
    // fire effects for a rule that fires for nobody live — and the ledger would
    // then report `already_fired` when it was eventually switched on, so the
    // mistake could not be undone by re-running anything.
    if (!lookup.active) {
      return { reason: "rule_inactive" };
    }

    if (!lookup.parsed.valid) {
      return { reason: "rule_invalid", detail: lookup.parsed.reason };
    }

    const rule = lookup.parsed.rule;
    const unsupported = backfillUnsupportedReason(rule.triggerEvent);

    if (unsupported) {
      return {
        reason: "unsupported_event",
        detail: `${rule.triggerEvent} cannot be backfilled: ${unsupported}`,
      };
    }

    const scanner = backfillScannerFor(rule.triggerEvent);

    const unreadable = rule.conditions.filter(
      (condition) =>
        condition.source === conditionSourceTokens.event &&
        scanner.unreconstructibleFields.includes(condition.field),
    );

    // Refused rather than silently evaluated against a placeholder. The rule is
    // perfectly valid — it just asks a question about the past that current
    // state cannot answer, and guessing would fire effects on a fiction.
    if (unreadable.length > 0) {
      return {
        reason: "unreconstructible_condition",
        detail:
          `${rule.triggerEvent} cannot be backfilled against ` +
          `${unreadable.map((condition) => condition.field).join(", ")}: ` +
          "the value is not recoverable from current state",
      };
    }

    return null;
  }

  private async execute(
    run: BackfillRunRow,
    leaseToken: string,
  ): Promise<RuleBackfillSummary | null> {
    const lookup = await this.rules.findById(run.ruleId);

    // Re-checked at execution time, not just at enqueue time: a rule can be
    // deactivated or edited between the request and the worker picking it up.
    const refusal = await this.refusalFor(run.ruleId);

    if (refusal || !lookup.found || !lookup.active || !lookup.parsed.valid) {
      await this.runs.finish(run.id, leaseToken, {
        status: backfillRunStatus.refused,
        refusal: refusal
          ? refusal.detail
            ? `${refusal.reason}: ${refusal.detail}`
            : refusal.reason
          : "rule_not_found",
      });

      return null;
    }

    try {
      return await this.scan(run, leaseToken, lookup.parsed.rule);
    } catch (error) {
      await this.runs.finish(run.id, leaseToken, {
        status: backfillRunStatus.failed,
        lastError: errorMessage(error),
      });

      throw error;
    }
  }

  private async scan(
    run: BackfillRunRow,
    leaseToken: string,
    rule: RuntimeEngineRule,
  ): Promise<RuleBackfillSummary> {
    const scanner = backfillScannerFor(rule.triggerEvent);

    let scanned = run.candidatesScanned;
    let fired = run.candidatesFired;
    let skipped = run.candidatesSkipped;
    let failed = run.candidatesFailed;
    const skippedReasons: Record<string, number> = { ...run.skippedReasons };
    const failures: RuleBackfillFailure[] = [
      ...(run.failures as RuleBackfillFailure[]),
    ];

    /**
     * The budget, and why it counts what it counts.
     *
     * `already_fired` candidates are deliberately excluded. If the limit
     * counted every candidate, a capped run would spend its whole budget
     * re-skipping the users the previous run had already fired for, and no
     * rerun would ever reach the rows beyond them — the rollout would stall
     * short of completion while reporting success each time. Counting only work
     * that was not already done guarantees every run makes forward progress.
     *
     * The resume cursor below makes the rescan cheap as well as harmless, but
     * this is the part that makes it *correct*: a cursor can be lost, a scan
     * re-requested from the start, and the run must still finish.
     */
    let unfinished = 0;

    // Resumes where the last claim stopped rather than rescanning from the
    // beginning.
    let cursor: string | null = run.cursor;
    let stoppedBecause: RuleBackfillSummary["stoppedBecause"] = run.dryRun
      ? "dry_run"
      : "exhausted";
    let firstPage = true;

    while (firstPage || cursor !== null) {
      // Paced between pages rather than between candidates: one pause per page
      // is enough to keep the scan off the app's back, and pausing per
      // candidate would make a large family take hours for no extra safety.
      if (!firstPage) {
        await delay(run.pauseMs);
      }

      firstPage = false;

      const page = await scanner.scanPage(
        this.entityManager,
        cursor,
        run.pageSize,
      );
      cursor = page.cursor;

      const pageOutcomes: BackfillUserOutcome[] = [];

      for (const candidate of page.candidates) {
        scanned += 1;

        // Counted, then dropped. A dry run still walks the scanners so the
        // reported reach is the real one, but it reserves nothing — so it
        // cannot leave a half-claimed ledger row behind for the real run.
        if (run.dryRun) {
          unfinished += 1;
          continue;
        }

        // A reader per candidate, not per run. The live evaluator shares one
        // across the rules of a single event because they all concern one user;
        // a backfill walks every user, and a shared reader would accumulate an
        // attribute cache the size of the user table.
        const reader = this.userAttributes.forEvaluation();
        const result = await this.firing.fire(rule, candidate, reader);

        if (result.outcome === "fired") {
          fired += 1;
          unfinished += 1;
          pageOutcomes.push({ userId: candidate.userId, outcome: "fired" });
          continue;
        }

        if (result.outcome === "skipped") {
          skipped += 1;
          skippedReasons[result.reason] =
            (skippedReasons[result.reason] ?? 0) + 1;

          if (result.reason !== "already_fired") {
            unfinished += 1;
          }

          pageOutcomes.push({ userId: candidate.userId, outcome: "skipped" });
          continue;
        }

        failed += 1;
        unfinished += 1;
        pageOutcomes.push({ userId: candidate.userId, outcome: "failed" });

        if (failures.length < MAX_REPORTED_FAILURES) {
          failures.push({
            userId: candidate.userId,
            stage: result.stage,
            error: result.error,
          });
        }

        await this.report(() =>
          this.observer.recordRuleError({
            eventId: candidate.id,
            eventName: candidate.eventName,
            userId: candidate.userId,
            ruleId: rule.id,
            stage: result.stage,
            error: result.error,
          }),
        );
      }

      // One statement per page rather than per candidate. These rows are what
      // let the summary describe *this* rollout in users rather than in
      // candidates, and they survive a resumed run because they are rows.
      if (pageOutcomes.length > 0) {
        await this.runs.recordUserOutcomes(run.id, pageOutcomes);
      }

      // Written after every page, so a crash costs one page rather than the
      // whole rollout. A false result means another worker took the lease over
      // while this page ran; continuing would scan on its behalf.
      const held = await this.runs.saveProgress(run.id, leaseToken, {
        cursor,
        candidatesScanned: scanned,
        candidatesFired: fired,
        candidatesSkipped: skipped,
        candidatesFailed: failed,
        skippedReasons,
        failures,
      });

      if (!held) {
        stoppedBecause = "lease_lost";
        break;
      }

      /**
       * The budget is checked here, between pages, and never mid-page.
       *
       * Stopping mid-page forces a choice between two broken options: advance
       * the cursor and lose the page's unprocessed tail forever, or rewind and
       * re-process its prefix on the next claim. The rewind is the subtler
       * trap — every candidate in that prefix except `already_fired` ones
       * charges the budget a second time, so a budget smaller than the repeated
       * prefix makes the rest of the scan permanently unreachable.
       *
       * Finishing the page removes the choice. The cursor only ever advances
       * past candidates that were actually processed, so nothing is repeated
       * and nothing is skipped. The cost is that a claim can overshoot its
       * budget — by less than one page, which is why the page size is the
       * smaller of the two knobs.
       */
      if (unfinished >= run.maxCandidates && cursor !== null) {
        stoppedBecause = "work_limit";
        break;
      }
    }

    // Queries, not tallies: they describe the whole run rather than this claim
    // of it, so a resumed run reports the same numbers a single pass would.
    const usersInScope = await scanner.countUsers(this.entityManager);
    const userCounts = await this.runs.countUsersByOutcome(run.id);

    const summary: RuleBackfillSummary = {
      runId: run.id,
      ruleId: rule.id,
      eventName: rule.triggerEvent,
      usersInScope,
      usersFired: userCounts.fired,
      usersSkipped: userCounts.skipped,
      usersFailed: userCounts.failed,
      candidatesScanned: scanned,
      candidatesFired: fired,
      candidatesSkipped: skipped,
      candidatesFailed: failed,
      skippedReasons,
      failures,
      stoppedBecause,
      resumeCursor: cursor,
    };

    // A lease lost mid-run leaves the row to whoever holds it now; finishing it
    // here would stamp somebody else's run as complete.
    if (stoppedBecause === "work_limit") {
      // Not finished — yielded. The budget bounds one claim so a long rollout
      // cannot monopolise the worker while other runs wait, and the run goes
      // straight back on the queue with its cursor so the next claim continues.
      await this.runs.requeue(run.id, leaseToken, {
        usersInScope,
        usersFired: userCounts.fired,
        usersSkipped: userCounts.skipped,
        usersFailed: userCounts.failed,
      });
    } else if (stoppedBecause !== "lease_lost") {
      await this.runs.finish(run.id, leaseToken, {
        status: backfillRunStatus.succeeded,
        stoppedBecause,
        usersInScope,
        usersFired: userCounts.fired,
        usersSkipped: userCounts.skipped,
        usersFailed: userCounts.failed,
      });
    }

    await this.report(() =>
      this.observer.recordBackfill({
        runId: summary.runId,
        ruleId: summary.ruleId,
        eventName: summary.eventName,
        usersInScope: summary.usersInScope,
        usersFired: summary.usersFired,
        usersSkipped: summary.usersSkipped,
        usersFailed: summary.usersFailed,
        candidatesScanned: summary.candidatesScanned,
        candidatesFired: summary.candidatesFired,
        candidatesSkipped: summary.candidatesSkipped,
        candidatesFailed: summary.candidatesFailed,
        skippedReasons: summary.skippedReasons,
        stoppedBecause: summary.stoppedBecause,
      }),
    );

    return summary;
  }

  // Observation never changes what the backfill did, for the same reason it
  // never changes what an evaluation did: an analytics outage must not turn
  // into a failed rollout.
  private async report(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(`Backfill observation failed: ${errorMessage(error)}`);
    }
  }
}
