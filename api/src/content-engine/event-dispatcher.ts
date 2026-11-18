import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { EventName } from "@contentual/content-engine-vocabulary";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { contentEngineProductEventName } from "../observability/product-events";
import type { ContentEvent } from "./content-event";
import { ContentEngineEventEntity } from "./entities/content-engine-event.entity";
import {
  CONTENT_EVENT_EVALUATOR,
  type ContentEventEvaluator,
} from "./event-evaluator.port";

// Long enough that a slow evaluator is not stolen mid-flight, short enough that
// a crashed dispatcher does not pin an event for minutes.
export const CLAIM_LEASE_MS = 60 * 1000;

const BASE_RETRY_DELAY_MS = 30 * 1000;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

// Exponential backoff from the attempt the claim just recorded. Capped so a
// permanently broken evaluator does not push an event days into the future,
// floored at the base delay so a zero attemptCount cannot produce a hot loop.
export function retryDelayMs(attemptCount: number): number {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
    MAX_RETRY_DELAY_MS,
  );
}

export interface DispatchResult {
  readonly eventId: string;
  readonly delivered: boolean;
  readonly reason?: "not_available" | "claim_lost" | "evaluator_failed";
}

// One statement does the whole claim: find an available pending row, stamp a
// fresh fencing token on it, and return it. Because it is a single UPDATE,
// two concurrent dispatchers cannot both come away holding the same event —
// the second finds "claimedUntil" in the future and matches nothing.
//
// attemptCount is incremented here rather than on the outcome, so a dispatcher
// that dies mid-evaluation still burns an attempt and the next one backs off.
const CLAIM_SQL = `
  UPDATE "content_engine_events"
     SET "claimToken" = $2,
         "claimedUntil" = $3,
         "attemptCount" = "attemptCount" + 1
   WHERE "id" = $1
     AND "status" = 'pending'
     AND "availableAt" <= now()
     AND ("claimedUntil" IS NULL OR "claimedUntil" <= now())
  RETURNING "id", "eventName", "userId", "payload", "attemptCount"
`;

// The claim token in the WHERE clause is the fence: a dispatcher whose lease
// expired while its evaluator ran holds a superseded token and matches nothing,
// so it cannot complete the event a newer holder is still working on.
const MARK_DELIVERED_SQL = `
  UPDATE "content_engine_events"
     SET "status" = 'delivered',
         "deliveredAt" = now(),
         "lastError" = NULL,
         "claimToken" = NULL,
         "claimedUntil" = NULL
   WHERE "id" = $1
     AND "claimToken" = $2
  RETURNING "id"
`;

// Status is deliberately left alone: the row stays pending and retryable. Only
// the claim is released and the next attempt pushed out.
const MARK_FAILED_SQL = `
  UPDATE "content_engine_events"
     SET "lastError" = $3,
         "claimToken" = NULL,
         "claimedUntil" = NULL,
         "availableAt" = now() + ($4::text || ' milliseconds')::interval
   WHERE "id" = $1
     AND "claimToken" = $2
  RETURNING "id"
`;

const SELECT_PENDING_SQL = `
  SELECT "id"
  FROM "content_engine_events"
  WHERE "status" = 'pending'
    AND "availableAt" <= now()
    AND ("claimedUntil" IS NULL OR "claimedUntil" <= now())
  ORDER BY "availableAt"
  LIMIT $1
`;

interface ClaimedRow {
  id: string;
  eventName: EventName;
  userId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
}

// TypeORM's postgres driver returns raw rows for a RETURNING statement when
// there are any, but a [rows, affectedCount] tuple when there are none. Reading
// `.length` on the raw result would see 2 for "nothing matched" — which, on the
// completion update, would mean a fenced-out dispatcher reported success.
function returnedRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }

  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Delivers durable Content Engine events to the evaluator, after the
 * transaction that produced them has committed.
 *
 * The evaluator is never called inside a database transaction. Rule evaluation
 * is arbitrary work — it may be slow, it may fail, it may itself write — and
 * holding the producing transaction open across it would let a failing rule
 * roll back the fact it was reacting to.
 *
 * Delivery is at-least-once. The window between a successful `evaluate()` and
 * the fenced completion update cannot be made atomic from here, so an evaluator
 * must be idempotent; `event.id` is stable and is the natural idempotency key.
 *
 * A failed delivery is never discarded: the row stays `pending` with its error
 * and a backed-off `availableAt`, and `dispatchPending()` will pick it up.
 */
@Injectable()
export class ContentEventDispatcher {
  private readonly logger = new Logger(ContentEventDispatcher.name);

  constructor(
    @InjectRepository(ContentEngineEventEntity)
    private readonly events: Repository<ContentEngineEventEntity>,
    @Inject(CONTENT_EVENT_EVALUATOR)
    private readonly evaluator: ContentEventEvaluator,
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics,
  ) {}

  // Delivers one event. Rethrows an evaluator failure so the caller can log it;
  // the row is already back to pending by then.
  async dispatch(eventId: string): Promise<DispatchResult> {
    const claimToken = randomUUID();
    const claimedUntil = new Date(Date.now() + CLAIM_LEASE_MS);

    const [claimed] = returnedRows<ClaimedRow>(
      await this.events.query(CLAIM_SQL, [eventId, claimToken, claimedUntil]),
    );

    // Delivered already, not yet available after a backoff, or actively held by
    // another dispatcher. All three mean "not ours to deliver".
    if (!claimed) {
      return { eventId, delivered: false, reason: "not_available" };
    }

    // The row's name and payload were validated together by the emitter before
    // they were ever stored, but that correlation is not recoverable from the
    // column types on the way back out — the driver hands back a plain
    // `eventName` string and an opaque `jsonb`. The assertion re-establishes
    // the pairing the outbox already guarantees; it is the one place in the
    // event path where it cannot be proven statically.
    const event = {
      id: claimed.id,
      eventName: claimed.eventName,
      userId: claimed.userId,
      payload: claimed.payload,
    } as ContentEvent;

    try {
      await this.evaluator.evaluate(event);
    } catch (error) {
      await this.releaseFailedClaim(
        eventId,
        claimToken,
        Number(claimed.attemptCount),
        error,
      );
      throw error;
    }

    this.captureProductEvent(event);

    const completed = returnedRows<{ id: string }>(
      await this.events.query(MARK_DELIVERED_SQL, [eventId, claimToken]),
    );

    if (completed.length === 0) {
      // The lease was taken over while the evaluator ran. The new holder owns
      // the outcome; reporting success here would be a lie about a row this
      // dispatcher no longer controls.
      return { eventId, delivered: false, reason: "claim_lost" };
    }

    return { eventId, delivered: true };
  }

  // The retry path: sweeps events left pending by a failed or crashed dispatch.
  // One failing event does not stop the sweep — each result reports its own
  // outcome.
  async dispatchPending(limit = 25): Promise<DispatchResult[]> {
    const pending = returnedRows<{ id: string }>(
      await this.events.query(SELECT_PENDING_SQL, [limit]),
    );

    const results: DispatchResult[] = [];

    for (const row of pending) {
      try {
        results.push(await this.dispatch(row.id));
      } catch {
        // dispatch() has already recorded the error and released the claim.
        results.push({
          eventId: row.id,
          delivered: false,
          reason: "evaluator_failed",
        });
      }
    }

    return results;
  }

  /**
   * Reports the delivered event as a product moment.
   *
   * Every Content Engine event is a product moment — a task completed, a
   * programme started, a platform connected — so they are captured here, once,
   * rather than at each of the twelve emitting call sites. A new domain event
   * therefore arrives in PostHog without anyone remembering to wire it up.
   *
   * Captured *before* the delivered-mark, not after. Delivery is at-least-once,
   * so a redelivery would double-count — which is why `event.id` is passed as the
   * PostHog `uuid`: PostHog drops a repeat of a uuid it has already ingested.
   * Capturing after the mark instead would lose the event outright whenever the
   * process died in between, and a lost moment is worse than a deduplicated one.
   *
   * The payload is forwarded as properties because the vocabulary keeps payloads
   * to ids, counts and enum tokens — exactly the dimensions a funnel slices on,
   * and nothing free-form. `userId` is dropped: it is already the distinct id.
   *
   * The catch is deliberate belt-and-braces. `ProductAnalytics` requires
   * implementations to be best-effort, but delivery correctness must not rest on
   * a promise made by whatever is bound to the port: a throw escaping here would
   * leave the event pending and re-run every effect that had already fired.
   */
  private captureProductEvent(event: ContentEvent): void {
    const properties = { ...(event.payload as Record<string, unknown>) };

    // Already the distinct id; repeating it as a property would just be a second
    // copy of the user id on every event.
    delete properties.userId;

    try {
      this.analytics.capture({
        identity: { userId: event.userId },
        event: contentEngineProductEventName(event.eventName),
        properties,
        uuid: event.id,
      });
    } catch (error) {
      this.logger.warn(
        `Product analytics capture failed for ${event.id}: ${String(error)}`,
      );
    }
  }

  // The backoff is computed from the attempt count the claim itself returned,
  // so it needs no extra read and cannot be skewed by a concurrent claim.
  private async releaseFailedClaim(
    eventId: string,
    claimToken: string,
    attemptCount: number,
    error: unknown,
  ): Promise<void> {
    await this.events.query(MARK_FAILED_SQL, [
      eventId,
      claimToken,
      error instanceof Error ? error.message : String(error),
      retryDelayMs(attemptCount),
    ]);
  }
}
