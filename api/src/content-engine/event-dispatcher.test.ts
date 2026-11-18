import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { Repository } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "./content-event";
import type { ContentEngineEventEntity } from "./entities/content-engine-event.entity";
import {
  ContentEventDispatcher,
  MAX_RETRY_DELAY_MS,
  retryDelayMs,
} from "./event-dispatcher";
import type { ContentEventEvaluator } from "./event-evaluator.port";
import type {
  ProductAnalytics,
  ProductEventInput,
} from "../observability/product-analytics.port";

// Records what the dispatcher reported, so the capture can be asserted on
// without a PostHog client anywhere in the test.
function recordingAnalytics(onCapture?: () => void): {
  analytics: ProductAnalytics;
  captured: ProductEventInput[];
} {
  const captured: ProductEventInput[] = [];

  return {
    analytics: {
      capture(input) {
        onCapture?.();
        captured.push(input);
      },
    },
    captured,
  };
}

interface RecordedQuery {
  sql: string;
  parameters: unknown[];
}

const EVENT_ID = "programme.started:user-1:programme-1";

function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    eventName: eventNameTokens.programmeStarted,
    userId: "user-1",
    payload: { userId: "user-1", programmeId: "programme-1" },
    attemptCount: 1,
    ...overrides,
  };
}

// The dispatcher speaks raw SQL throughout, so the repository is reduced to its
// query() method. Responses are consumed in order, which is what lets a test say
// "the claim returned nothing" or "the completion update matched no row".
function fakeRepository(responses: unknown[] = []): {
  repository: Repository<ContentEngineEventEntity>;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  let call = 0;
  const repository = {
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      const response = responses[call];
      call += 1;
      return response ?? [];
    },
  } as unknown as Repository<ContentEngineEventEntity>;

  return { repository, queries };
}

function recordingEvaluator(): {
  evaluator: ContentEventEvaluator;
  seen: ContentEvent[];
} {
  const seen: ContentEvent[] = [];
  return {
    evaluator: {
      evaluate: async (event) => {
        seen.push(event);
      },
    },
    seen,
  };
}

function failingEvaluator(message: string): ContentEventEvaluator {
  return {
    evaluate: async () => {
      throw new Error(message);
    },
  };
}

test("dispatch claims the row atomically with a fencing token and a lease", async () => {
  const { evaluator } = recordingEvaluator();
  const { repository, queries } = fakeRepository([
    [claimedRow()],
    [{ id: EVENT_ID }],
  ]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  await dispatcher.dispatch(EVENT_ID);

  const claim = queries[0];
  assert.match(claim.sql, /UPDATE "content_engine_events"/);
  assert.match(claim.sql, /"claimToken" = \$2/);
  assert.match(claim.sql, /"attemptCount" = "attemptCount" \+ 1/);
  assert.match(claim.sql, /"status" = 'pending'/);
  assert.match(claim.sql, /"availableAt" <= now\(\)/);
  assert.match(
    claim.sql,
    /\("claimedUntil" IS NULL OR "claimedUntil" <= now\(\)\)/,
  );
  assert.equal(claim.parameters[0], EVENT_ID);
  assert.match(
    String(claim.parameters[1]),
    /^[0-9a-f-]{36}$/,
    "claim token must be a fresh UUID",
  );
});

test("a row that cannot be claimed never reaches the evaluator", async () => {
  const { evaluator, seen } = recordingEvaluator();
  // The claim matched nothing: delivered, not yet available, or actively held.
  const { repository, queries } = fakeRepository([[]]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  const result = await dispatcher.dispatch(EVENT_ID);

  assert.deepEqual(result, {
    eventId: EVENT_ID,
    delivered: false,
    reason: "not_available",
  });
  assert.equal(seen.length, 0);
  assert.equal(queries.length, 1, "no follow-up write after a failed claim");
});

test("a successful evaluation marks the event delivered under its own token", async () => {
  const { evaluator, seen } = recordingEvaluator();
  const { repository, queries } = fakeRepository([
    [claimedRow()],
    [{ id: EVENT_ID }],
  ]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  const result = await dispatcher.dispatch(EVENT_ID);

  assert.deepEqual(result, { eventId: EVENT_ID, delivered: true });
  assert.deepEqual(seen, [
    {
      id: EVENT_ID,
      eventName: eventNameTokens.programmeStarted,
      userId: "user-1",
      payload: { userId: "user-1", programmeId: "programme-1" },
    },
  ]);

  const completion = queries[1];
  assert.match(completion.sql, /"status" = 'delivered'/);
  assert.match(completion.sql, /"deliveredAt" = now\(\)/);
  assert.match(completion.sql, /"claimToken" = NULL/);
  assert.match(completion.sql, /"claimedUntil" = NULL/);
  // Fencing: without the token in the WHERE clause a dispatcher whose lease
  // expired could complete the row a newer holder is still working on.
  assert.match(completion.sql, /WHERE "id" = \$1\s+AND "claimToken" = \$2/);
  assert.equal(completion.parameters[0], EVENT_ID);
  assert.equal(completion.parameters[1], queries[0].parameters[1]);
});

test("a stale token cannot mark a reclaimed event delivered", async () => {
  const { evaluator } = recordingEvaluator();
  // Claim succeeds, evaluation succeeds, but the fenced completion matches no
  // row — the lease was taken over while the evaluator ran.
  const { repository } = fakeRepository([[claimedRow()], []]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  const result = await dispatcher.dispatch(EVENT_ID);

  assert.deepEqual(result, {
    eventId: EVENT_ID,
    delivered: false,
    reason: "claim_lost",
  });
});

test("an evaluator failure leaves the event pending with its error and backoff", async () => {
  const { repository, queries } = fakeRepository([
    [claimedRow({ attemptCount: 1 })],
    [{ id: EVENT_ID }],
  ]);
  const dispatcher = new ContentEventDispatcher(
    repository,
    failingEvaluator("evaluator exploded"),
    recordingAnalytics().analytics,
  );

  await assert.rejects(
    () => dispatcher.dispatch(EVENT_ID),
    /evaluator exploded/,
  );

  const failure = queries[1];
  assert.match(failure.sql, /"lastError" = \$3/);
  assert.match(failure.sql, /"claimToken" = NULL/);
  assert.match(failure.sql, /"claimedUntil" = NULL/);
  assert.match(failure.sql, /"availableAt" = now\(\) \+/);
  // The row must stay pending: a failed delivery is retryable, never discarded.
  assert.equal(
    failure.sql.includes(`"status" = 'delivered'`),
    false,
    "a failed dispatch must not mark the event delivered",
  );
  assert.match(failure.sql, /WHERE "id" = \$1\s+AND "claimToken" = \$2/);
  assert.match(String(failure.parameters[2]), /evaluator exploded/);
  assert.equal(failure.parameters[3], retryDelayMs(1));
});

test("retry backoff doubles from 30 seconds and caps at 15 minutes", () => {
  assert.equal(retryDelayMs(1), 30_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(3), 120_000);
  assert.equal(retryDelayMs(4), 240_000);
  assert.equal(retryDelayMs(6), MAX_RETRY_DELAY_MS);
  assert.equal(retryDelayMs(50), MAX_RETRY_DELAY_MS);
  // Defensive: a zero or negative attempt count must not produce a sub-30s
  // delay that would let a hot loop hammer a broken evaluator.
  assert.equal(retryDelayMs(0), 30_000);
});

test("dispatchPending claims at most the requested number of available events", async () => {
  const { evaluator, seen } = recordingEvaluator();
  const { repository, queries } = fakeRepository([
    [{ id: "event-a" }, { id: "event-b" }],
    [claimedRow({ id: "event-a" })],
    [{ id: "event-a" }],
    [claimedRow({ id: "event-b" })],
    [{ id: "event-b" }],
  ]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  const results = await dispatcher.dispatchPending(25);

  assert.match(queries[0].sql, /SELECT "id"/);
  assert.match(queries[0].sql, /"status" = 'pending'/);
  assert.match(queries[0].sql, /"availableAt" <= now\(\)/);
  assert.match(queries[0].sql, /LIMIT \$1/);
  assert.deepEqual(queries[0].parameters, [25]);
  assert.deepEqual(results, [
    { eventId: "event-a", delivered: true },
    { eventId: "event-b", delivered: true },
  ]);
  assert.deepEqual(
    seen.map((event) => event.id),
    ["event-a", "event-b"],
  );
});

test("dispatchPending reports a failing event without abandoning the rest", async () => {
  let calls = 0;
  const evaluator: ContentEventEvaluator = {
    evaluate: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("first one failed");
      }
    },
  };
  const { repository } = fakeRepository([
    [{ id: "event-a" }, { id: "event-b" }],
    [claimedRow({ id: "event-a" })],
    [{ id: "event-a" }],
    [claimedRow({ id: "event-b" })],
    [{ id: "event-b" }],
  ]);
  const dispatcher = new ContentEventDispatcher(repository, evaluator, recordingAnalytics().analytics);

  const results = await dispatcher.dispatchPending(25);

  assert.deepEqual(results, [
    { eventId: "event-a", delivered: false, reason: "evaluator_failed" },
    { eventId: "event-b", delivered: true },
  ]);
  assert.equal(calls, 2);
});

test("reports the delivered event as a product moment", async () => {
  const { repository } = fakeRepository([[claimedRow()], [{ id: EVENT_ID }]]);
  const { evaluator } = recordingEvaluator();
  const { analytics, captured } = recordingAnalytics();

  await new ContentEventDispatcher(repository, evaluator, analytics).dispatch(
    EVENT_ID,
  );

  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, "content_engine.programme.started");
  assert.deepEqual(captured[0].identity, { userId: "user-1" });
  // The payload's dimensions, minus userId — that is already the distinct id.
  assert.deepEqual(captured[0].properties, { programmeId: "programme-1" });
});

// Delivery is at-least-once, so the stable event id is what stops a redelivery
// double-counting: PostHog drops a repeat of a uuid it has already ingested.
test("passes the stable event id as the deduplication uuid", async () => {
  const { repository } = fakeRepository([[claimedRow()], [{ id: EVENT_ID }]]);
  const { evaluator } = recordingEvaluator();
  const { analytics, captured } = recordingAnalytics();

  await new ContentEventDispatcher(repository, evaluator, analytics).dispatch(
    EVENT_ID,
  );

  assert.equal(captured[0].uuid, EVENT_ID);
});

test("reports nothing for an event it could not claim", async () => {
  const { repository } = fakeRepository([[]]);
  const { evaluator } = recordingEvaluator();
  const { analytics, captured } = recordingAnalytics();

  const result = await new ContentEventDispatcher(
    repository,
    evaluator,
    analytics,
  ).dispatch(EVENT_ID);

  assert.equal(result.delivered, false);
  assert.equal(captured.length, 0);
});

test("reports nothing when the evaluator failed", async () => {
  const { repository } = fakeRepository([[claimedRow()], [{ id: EVENT_ID }]]);
  const { analytics, captured } = recordingAnalytics();
  const dispatcher = new ContentEventDispatcher(
    repository,
    failingEvaluator("evaluator exploded"),
    analytics,
  );

  await assert.rejects(() => dispatcher.dispatch(EVENT_ID));

  assert.equal(captured.length, 0);
});

// Analytics sits on the delivery path, so a capture that threw would leave the
// event pending and re-run every effect that had already fired.
test("a throwing capture does not stop delivery", async () => {
  const { repository } = fakeRepository([[claimedRow()], [{ id: EVENT_ID }]]);
  const { evaluator } = recordingEvaluator();
  const { analytics } = recordingAnalytics(() => {
    throw new Error("posthog unreachable");
  });

  const result = await new ContentEventDispatcher(
    repository,
    evaluator,
    analytics,
  ).dispatch(EVENT_ID);

  assert.equal(result.delivered, true);
});
