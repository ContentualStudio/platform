import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";
import type { RuntimeEngineRule } from "../engine-rule";
import type { EngineRuleRepository, RuleLookup } from "../engine-rule.repository";
import type {
  RuleBackfillObservation,
  RuleEvaluationRuleError,
  RuleEvaluationObserver,
} from "../rule-evaluation-observer.port";
import type { RuleFiringOutcome, RuleFiringService } from "../rule-firing.service";
import type { UserAttributeReaderFactory } from "../user-attribute.reader";
import {
  backfillRunStatus,
  type BackfillRunRow,
  type RuleBackfillRunRepository,
} from "./rule-backfill-run.repository";
import {
  BackfillRefusedError,
  RuleBackfillService,
} from "./rule-backfill.service";

function rule(overrides: Partial<RuntimeEngineRule> = {}): RuntimeEngineRule {
  return {
    id: "rule-1",
    key: "streak-badge",
    triggerEvent: eventNameTokens.streakReached,
    conditions: [],
    effectType: effectTypeTokens.awardBadge,
    effectParams: { badgeKey: "streak-badge" },
    dedupeScope: dedupeScopeTokens.oncePerUser,
    ...overrides,
  };
}

function active(overrides: Partial<RuntimeEngineRule> = {}): RuleLookup {
  return {
    found: true,
    active: true,
    parsed: { valid: true, rule: rule(overrides) },
  };
}

interface Harness {
  service: RuleBackfillService;
  fired: string[];
  queries: string[];
  backfills: RuleBackfillObservation[];
  ruleErrors: RuleEvaluationRuleError[];
  rows: BackfillRunRow[];
  readers: number;
  userOutcomes: Map<string, string>;
}

// An in-memory stand-in for the run table, faithful to the parts the service
// depends on: a claim transitions queued to running, progress is fenced on the
// lease token, and the row survives between claims.
function fakeRuns(
  rows: BackfillRunRow[],
  state: { userOutcomes: Map<string, string> },
) {
  let leases = 0;

  return {
    async enqueue(input: {
      ruleId: string;
      requestedBy?: string | null;
      pageSize: number;
      pauseMs: number;
      maxCandidates: number;
      dryRun: boolean;
    }) {
      const row = {
        id: `run-${rows.length + 1}`,
        ruleId: input.ruleId,
        status: backfillRunStatus.queued,
        requestedBy: input.requestedBy ?? null,
        pageSize: input.pageSize,
        pauseMs: input.pauseMs,
        maxCandidates: input.maxCandidates,
        dryRun: input.dryRun,
        cursor: null,
        candidatesScanned: 0,
        candidatesFired: 0,
        candidatesSkipped: 0,
        candidatesFailed: 0,
        usersInScope: null,
        usersFired: null,
        usersSkipped: 0,
        usersFailed: 0,
        skippedReasons: {},
        failures: [],
        stoppedBecause: null,
        refusal: null,
        lastError: null,
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
      } as BackfillRunRow;

      rows.push(row);

      return row;
    },

    async claimNext() {
      const row = rows.find((it) => it.status === backfillRunStatus.queued);

      if (!row) {
        return null;
      }

      row.status = backfillRunStatus.running;
      leases += 1;

      return { run: { ...row }, leaseToken: `lease-${leases}` };
    },

    async saveProgress(
      id: string,
      _leaseToken: string,
      progress: {
        cursor: string | null;
        candidatesScanned: number;
        candidatesFired: number;
        candidatesSkipped: number;
        candidatesFailed: number;
        skippedReasons: Readonly<Record<string, number>>;
        failures: readonly { userId: string; stage: string; error: string }[];
      },
    ) {
      const row = rows.find((it) => it.id === id);

      if (!row) {
        return false;
      }

      Object.assign(row, progress, {
        skippedReasons: { ...progress.skippedReasons },
        failures: [...progress.failures],
      });

      return true;
    },

    async finish(
      id: string,
      _leaseToken: string,
      outcome: Record<string, unknown>,
    ) {
      const row = rows.find((it) => it.id === id);

      if (row) {
        Object.assign(row, outcome, { finishedAt: new Date() });
      }

      return row ?? null;
    },

    async recordUserOutcomes(
      runId: string,
      list: readonly { userId: string; outcome: string }[],
    ) {
      const ranks: Record<string, number> = { fired: 3, failed: 2, skipped: 1 };

      for (const entry of list) {
        const held = state.userOutcomes.get(entry.userId);

        if (!held || ranks[entry.outcome] > ranks[held]) {
          state.userOutcomes.set(entry.userId, entry.outcome);
        }
      }

      void runId;
    },

    async countUsersByOutcome() {
      const counts = { fired: 0, failed: 0, skipped: 0 };

      for (const outcome of state.userOutcomes.values()) {
        counts[outcome as keyof typeof counts] += 1;
      }

      return counts;
    },

    async requeue(id: string) {
      const row = rows.find((it) => it.id === id);

      if (!row) {
        return false;
      }

      row.status = backfillRunStatus.queued;
      row.stoppedBecause = "work_limit";

      return true;
    },

  } as unknown as RuleBackfillRunRepository;
}

// `user_streak` rows, since the default rule triggers on streak.reached. The
// real scanner runs against them, so paging and cursors are exercised for real
// and only the database and the firing path are faked.
function harness(options: {
  lookup?: RuleLookup;
  streakUsers?: number;
  outcome?: (userId: string) => RuleFiringOutcome;
  observerThrows?: boolean;
}): Harness {
  const fired: string[] = [];
  const queries: string[] = [];
  const backfills: RuleBackfillObservation[] = [];
  const ruleErrors: RuleEvaluationRuleError[] = [];
  const rows: BackfillRunRow[] = [];
  // Keyed by user, exactly as the run's per-user rows are, so a user seen on
  // several candidates counts once.
  const state = { readers: 0, userOutcomes: new Map<string, string>() };

  const users = Array.from({ length: options.streakUsers ?? 0 }, (_, index) => ({
    // Zero-padded so lexical order and numeric order agree — the keyset cursor
    // is a text comparison.
    userId: `user-${String(index).padStart(3, "0")}`,
    currentLength: 5,
    runOrdinal: 1,
  }));

  const entityManager = {
    async query(sql: string, parameters: unknown[]) {
      queries.push(sql);

      if (sql.includes("COUNT(DISTINCT")) {
        return [{ count: String(users.length) }];
      }

      const after = String(parameters[0]);
      const limit = Number(parameters[1]);

      return users.filter((row) => row.userId > after).slice(0, limit);
    },
  } as unknown as EntityManager;

  const rules = {
    async findById() {
      return options.lookup ?? active();
    },
  } as unknown as EngineRuleRepository;

  const userAttributes = {
    forEvaluation() {
      state.readers += 1;
      return { async read() { return null; } };
    },
  } as unknown as UserAttributeReaderFactory;

  const firing = {
    async fire(_rule: RuntimeEngineRule, event: { userId: string }) {
      const outcome = options.outcome?.(event.userId) ?? {
        outcome: "fired" as const,
        qualified: true as const,
      };

      if (outcome.outcome === "fired") {
        fired.push(event.userId);
      }

      return outcome;
    },
  } as unknown as RuleFiringService;

  const observer: RuleEvaluationObserver = {
    async record() {
      throw new Error("a backfill never reports an evaluation");
    },
    async recordRuleError(input) {
      if (options.observerThrows) throw new Error("posthog down");
      ruleErrors.push(input);
    },
    async recordBackfill(summary) {
      if (options.observerThrows) throw new Error("posthog down");
      backfills.push(summary);
    },
  };

  return {
    service: new RuleBackfillService(
      entityManager,
      rules,
      fakeRuns(rows, state),
      userAttributes,
      firing,
      observer,
    ),
    fired,
    queries,
    backfills,
    ruleErrors,
    rows,
    get readers() {
      return state.readers;
    },
    get userOutcomes() {
      return state.userOutcomes;
    },
  };
}

const noPause = { pauseMs: 0 } as const;

// Enqueue then work off, which is the path both the CLI and the admin endpoint
// take.
async function runOnce(h: Harness, options: Record<string, unknown> = {}) {
  await h.service.enqueue("rule-1", { ...noPause, ...options });

  const [summary] = await h.service.processQueued();

  return summary;
}

test("a rule nobody mirrored is refused at enqueue, and nothing is queued", async () => {
  const h = harness({ lookup: { found: false } });

  await assert.rejects(
    () => h.service.enqueue("rule-1", noPause),
    (error: unknown) =>
      error instanceof BackfillRefusedError &&
      error.refusal.reason === "rule_not_found",
  );

  // A queued run that can only ever be refused is noise, and would hold the
  // rule's one live-run slot against a corrected retry.
  assert.deepEqual(h.rows, []);
});

// The two are collapsed by a naive `WHERE active = true` lookup, and they need
// different answers: one is a typo, the other is "switch it on first".
test("an inactive rule is refused distinctly from a missing one", async () => {
  const h = harness({ lookup: { found: true, active: false } });

  await assert.rejects(
    () => h.service.enqueue("rule-1", noPause),
    (error: unknown) =>
      error instanceof BackfillRefusedError &&
      error.refusal.reason === "rule_inactive",
  );
  assert.deepEqual(h.fired, []);
});

test("a rule whose mirrored row does not parse is refused with the reason", async () => {
  const h = harness({
    lookup: {
      found: true,
      active: true,
      parsed: { valid: false, ruleId: "rule-1", reason: "conditions is not an array" },
    },
  });

  await assert.rejects(
    () => h.service.enqueue("rule-1", noPause),
    /conditions is not an array/,
  );
});

// The alternative is answering the condition against a placeholder, which would
// fire effects on a value nobody can defend.
test("a rule conditioning on a value current state cannot recover is refused", async () => {
  const h = harness({
    lookup: active({
      triggerEvent: eventNameTokens.levelChanged,
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "previousLevel",
          operator: operatorTokens.eq,
          value: "Silver",
        },
      ],
    }),
    streakUsers: 3,
  });

  await assert.rejects(
    () => h.service.enqueue("rule-1", noPause),
    (error: unknown) =>
      error instanceof BackfillRefusedError &&
      error.refusal.reason === "unreconstructible_condition" &&
      /previousLevel/.test(error.message),
  );
  assert.deepEqual(h.fired, []);
});

test("the same field on a family that does store it is backfilled normally", async () => {
  const h = harness({
    lookup: active({
      triggerEvent: eventNameTokens.levelChanged,
      conditions: [
        {
          source: conditionSourceTokens.event,
          field: "newLevel",
          operator: operatorTokens.eq,
          value: "Silver",
        },
      ],
    }),
  });

  const run = await h.service.enqueue("rule-1", noPause);

  assert.equal(run.status, backfillRunStatus.queued);
});

// A rule switched off between the request and the worker picking it up is
// refused there, and the refusal is persisted — by then the request was
// legitimately accepted, so it needs a durable outcome.
test("a rule deactivated after enqueue is refused by the worker, durably", async () => {
  const lookups: RuleLookup[] = [active(), { found: true, active: false }];
  const h = harness({});

  (
    h.service as unknown as { rules: { findById: () => Promise<RuleLookup> } }
  ).rules.findById = async () => lookups.shift() ?? { found: true, active: false };

  await h.service.enqueue("rule-1", noPause);
  const summaries = await h.service.processQueued();

  assert.deepEqual(summaries, []);
  assert.equal(h.rows[0].status, backfillRunStatus.refused);
  assert.equal(h.rows[0].refusal, "rule_inactive");
});

test("every candidate across every page reaches the firing path", async () => {
  const h = harness({ streakUsers: 7 });

  const summary = await runOnce(h, { pageSize: 3 });

  assert.equal(h.fired.length, 7);
  assert.equal(summary.candidatesScanned, 7);
  assert.equal(summary.candidatesFired, 7);
  assert.equal(summary.stoppedBecause, "exhausted");
});

test("scanned accounts for every candidate: fired plus skipped plus failed", async () => {
  const h = harness({
    streakUsers: 6,
    outcome: (userId) => {
      if (userId.endsWith("0")) {
        return { outcome: "skipped", reason: "already_fired", qualified: true };
      }
      if (userId.endsWith("1")) {
        return {
          outcome: "failed",
          stage: "effect",
          error: "badge missing",
          retryable: true,
          qualified: true,
        };
      }
      return { outcome: "fired", qualified: true };
    },
  });

  const summary = await runOnce(h);

  const { candidatesScanned, candidatesFired, candidatesSkipped, candidatesFailed } =
    summary;
  assert.equal(candidatesScanned, 6);
  assert.equal(
    candidatesFired + candidatesSkipped + candidatesFailed,
    candidatesScanned,
  );
  assert.deepEqual(summary.skippedReasons, { already_fired: 1 });
});

// The acceptance criteria are stated in users, and a per-record family produces
// several candidates per user — so the two must be reported separately rather
// than one standing in for the other.
test("users are reported from queries, not from the candidate tallies", async () => {
  const h = harness({
    streakUsers: 5,
    outcome: (userId) =>
      userId === "user-004"
        ? { outcome: "skipped", reason: "already_fired", qualified: true }
        : { outcome: "fired", qualified: true },
  });

  const summary = await runOnce(h);

  assert.equal(summary.usersInScope, 5);
  assert.equal(summary.usersFired, 4);
  assert.equal(summary.usersSkipped, 1);
  assert.equal(summary.candidatesScanned, 5);
});

test("a dry run reports users in scope but never claims users fired", async () => {
  const h = harness({ streakUsers: 5 });

  const summary = await runOnce(h, { dryRun: true });

  assert.equal(summary.usersInScope, 5);
  // Nothing was attempted, so the run has no per-user outcomes to count. A
  // count read from the firing ledger would have borrowed whatever fired for
  // real and made a dry run look like it had done something.
  assert.equal(summary.usersFired, 0);
  assert.equal(summary.usersSkipped, 0);
  assert.deepEqual(h.fired, []);
});

/**
 * A user can be several candidates — a completed programme each, a follower
 * tier each. Only one of those outcomes can be *the* outcome for that user, and
 * it must be the strongest: firing once is what matters, not being skipped
 * afterwards on a duplicate candidate.
 */
test("a user seen on several candidates counts once, at their best outcome", async () => {
  const h = harness({ streakUsers: 1 });

  await h.service.enqueue("rule-1", noPause);
  await h.service.processQueued();

  // Simulates the second candidate for a user who already fired on the first.
  await (
    h.service as unknown as {
      runs: {
        recordUserOutcomes: (
          runId: string,
          outcomes: { userId: string; outcome: string }[],
        ) => Promise<void>;
      };
    }
  ).runs.recordUserOutcomes(h.rows[0].id, [
    { userId: "user-000", outcome: "skipped" },
  ]);

  assert.equal(h.userOutcomes.get("user-000"), "fired");
});

// This is the idempotency claim, stated in the summary an operator reads.
test("a re-run over already-fired users reports skips rather than firings", async () => {
  const h = harness({
    streakUsers: 4,
    outcome: () => ({
      outcome: "skipped",
      reason: "already_fired",
      qualified: true,
    }),
  });

  const summary = await runOnce(h);

  assert.deepEqual(h.fired, []);
  assert.deepEqual(summary.skippedReasons, { already_fired: 4 });
  assert.equal(summary.candidatesFired, 0);
});

test("a failing candidate is reported per-rule and does not stop the run", async () => {
  const h = harness({
    streakUsers: 3,
    outcome: (userId) =>
      userId === "user-001"
        ? {
            outcome: "failed",
            stage: "effect",
            error: "target unavailable",
            retryable: true,
            qualified: true,
          }
        : { outcome: "fired", qualified: true },
  });

  const summary = await runOnce(h);

  assert.deepEqual(h.fired, ["user-000", "user-002"]);
  assert.deepEqual(summary.failures, [
    { userId: "user-001", stage: "effect", error: "target unavailable" },
  ]);
  assert.equal(h.ruleErrors.length, 1);
  assert.equal(h.ruleErrors[0].ruleId, "rule-1");
});

test("the work limit yields rather than finishing, and records where to resume", async () => {
  const h = harness({ streakUsers: 10 });

  await h.service.enqueue("rule-1", {
    ...noPause,
    pageSize: 2,
    maxCandidates: 3,
  });

  // One claim only, so the budget's effect is observable; processQueued() would
  // immediately re-claim the yielded run and finish the rollout.
  const [summary] = await h.service.processQueued(1);

  // Two pages of two: the budget is reached during the second and checked at
  // its end, so a claim overshoots by less than one page and never stops with
  // a page half-processed.
  assert.equal(summary.candidatesScanned, 4);
  assert.equal(summary.stoppedBecause, "work_limit");
  assert.equal(h.fired.length, 4);
  // Without this the next claim would rescan from the beginning.
  assert.notEqual(summary.resumeCursor, null);
  assert.equal(h.rows[0].cursor, summary.resumeCursor);
  // Back on the queue: a budget is a yield point, not the end of the rollout.
  assert.equal(h.rows[0].status, backfillRunStatus.queued);
});

/**
 * The bug this exists to prevent: a capped run that can never finish.
 *
 * If the budget counted every candidate, a rerun would spend the whole of it
 * re-skipping the users the previous run fired for and would never reach the
 * rest — every rerun reporting success while the rollout stayed stuck short of
 * completion.
 *
 * Each pass here starts from a fresh row with no cursor, which is the harshest
 * case on purpose: it proves the budget rule alone guarantees forward progress,
 * without leaning on the resume cursor to make the rescan cheap.
 */
test("a capped rerun reaches users the first run never got to", async () => {
  const alreadyFired = new Set<string>();
  const h = harness({
    streakUsers: 10,
    outcome: (userId) => {
      if (alreadyFired.has(userId)) {
        return { outcome: "skipped", reason: "already_fired", qualified: true };
      }

      alreadyFired.add(userId);
      return { outcome: "fired", qualified: true };
    },
  });

  const capped = async () => {
    h.rows.length = 0;
    await h.service.enqueue("rule-1", {
      ...noPause,
      pageSize: 2,
      maxCandidates: 2,
    });

    // One claim, so the budget's effect is observable rather than being worked
    // straight off by the same pass.
    const [summary] = await h.service.processQueued(1);
    return summary;
  };

  const first = await capped();
  assert.equal(first.candidatesFired, 2);

  const second = await capped();
  assert.equal(second.candidatesFired, 2);
  assert.deepEqual(second.skippedReasons, { already_fired: 2 });

  const third = await capped();
  assert.equal(third.candidatesFired, 2);
  assert.equal(alreadyFired.size, 6);
});

/**
 * The starvation a mid-page stop causes, and why the budget is checked between
 * pages instead.
 *
 * Rewinding to the start of a page re-processes its prefix on the next claim,
 * and every candidate in that prefix except `already_fired` ones charges the
 * budget again. Here the first four candidates skip on a condition — they cost
 * budget every single time — so with a budget of four the fifth candidate would
 * never be reached, on this claim or on any future one.
 */
test("a prefix of condition-skipped candidates cannot starve the ones behind it", async () => {
  const h = harness({
    streakUsers: 6,
    outcome: (userId) =>
      userId < "user-004"
        ? {
            outcome: "skipped",
            reason: "condition_not_met",
            qualified: false,
          }
        : { outcome: "fired", qualified: true },
  });

  await h.service.enqueue("rule-1", {
    ...noPause,
    pageSize: 6,
    maxCandidates: 4,
  });

  const [summary] = await h.service.processQueued(1);

  // The page is finished rather than abandoned, so the two users behind the
  // skipped prefix are reached on this very claim.
  assert.deepEqual(h.fired, ["user-004", "user-005"]);
  assert.equal(summary.candidatesScanned, 6);
});

test("a yielded run resumes from its stored cursor rather than rescanning", async () => {
  const h = harness({ streakUsers: 10 });

  await h.service.enqueue("rule-1", {
    ...noPause,
    pageSize: 2,
    maxCandidates: 4,
  });

  const [first] = await h.service.processQueued(1);
  assert.equal(first.candidatesScanned, 4);

  const [second] = await h.service.processQueued(1);

  // Counters carry across claims because they live in the row, not in the
  // worker, so this continues from 4 rather than restarting at 0.
  assert.ok(second.candidatesScanned > first.candidatesScanned);

  // And the whole rollout completes without an operator asking again, reaching
  // every user rather than stalling at the budget.
  const rest = await h.service.processQueued();
  assert.equal(rest[rest.length - 1].stoppedBecause, "exhausted");
  assert.deepEqual(h.fired.length, 10);
});

// A shared reader would hold one attribute row per user for the whole run —
// the user table, in memory, in a long-lived process.
test("each candidate gets its own attribute reader", async () => {
  const h = harness({ streakUsers: 4 });

  await runOnce(h);

  assert.equal(h.readers, 4);
});

test("the run is reported to observability once, with both count families", async () => {
  const h = harness({ streakUsers: 3 });

  const summary = await runOnce(h);

  assert.equal(h.backfills.length, 1);
  assert.deepEqual(h.backfills[0], {
    runId: summary.runId,
    ruleId: "rule-1",
    eventName: eventNameTokens.streakReached,
    usersInScope: 3,
    usersFired: 3,
    usersSkipped: 0,
    usersFailed: 0,
    candidatesScanned: 3,
    candidatesFired: 3,
    candidatesSkipped: 0,
    candidatesFailed: 0,
    skippedReasons: {},
    stoppedBecause: "exhausted",
  });
});

// An analytics outage must not turn into a failed rollout — the rollout is the
// part with side effects, and it already happened.
test("an observer that throws does not fail the run", async () => {
  const h = harness({
    streakUsers: 3,
    observerThrows: true,
    outcome: (userId) =>
      userId === "user-001"
        ? {
            outcome: "failed",
            stage: "effect",
            error: "boom",
            retryable: true,
            qualified: true,
          }
        : { outcome: "fired", qualified: true },
  });

  // Both observation points throw here: the per-rule error inside the loop and
  // the summary at the end.
  const summary = await runOnce(h);

  assert.equal(summary.candidatesFired, 2);
  assert.equal(summary.candidatesFailed, 1);
  assert.equal(h.rows[0].status, backfillRunStatus.succeeded);
});

// A worker whose claim was taken over must stop rather than keep scanning on
// behalf of a run somebody else now owns.
test("losing the lease stops the run without finishing it", async () => {
  const h = harness({ streakUsers: 10 });

  (
    h.service as unknown as {
      runs: { saveProgress: () => Promise<boolean> };
    }
  ).runs.saveProgress = async () => false;

  const summary = await runOnce(h, { pageSize: 2 });

  assert.equal(summary.stoppedBecause, "lease_lost");
  // Left running for whoever holds it; stamping it succeeded here would mark
  // somebody else's run complete.
  assert.equal(h.rows[0].status, backfillRunStatus.running);
});

test("the worker works off several queued runs in one pass", async () => {
  const h = harness({ streakUsers: 2 });

  await h.service.enqueue("rule-1", noPause);
  await h.service.enqueue("rule-2", noPause);

  const summaries = await h.service.processQueued();

  assert.equal(summaries.length, 2);
});
