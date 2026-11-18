import { isDeepStrictEqual } from "node:util";
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import {
  eventPayloadSchemas,
  type EventName,
  type EventPayload,
} from "@contentual/content-engine-vocabulary";
import {
  ContentEventCollisionError,
  ContentEventValidationError,
  type ContentEventOf,
} from "./content-event";

export interface EmitContentEventInput<Event extends EventName> {
  // Stable and derived from the fact, not generated: the same committed fact
  // must produce the same identity across request retries.
  readonly eventId: string;
  readonly eventName: Event;
  readonly payload: EventPayload<Event>;
}

// ON CONFLICT DO NOTHING rather than DO UPDATE: a replay must not rewrite an
// event that may already have been delivered. No returned row means the ID was
// already taken, and the emitter then reads it back to decide replay vs.
// collision.
const INSERT_SQL = `
  INSERT INTO "content_engine_events"
    ("id", "eventName", "userId", "payload")
  VALUES ($1, $2, $3, $4::jsonb)
  ON CONFLICT ("id") DO NOTHING
  RETURNING "id", "eventName", "userId", "payload"
`;

const SELECT_SQL = `
  SELECT "id", "eventName", "userId", "payload"
  FROM "content_engine_events"
  WHERE "id" = $1
`;

interface OutboxRow {
  id: string;
  eventName: string;
  userId: string;
  payload: Record<string, unknown>;
}

// TypeORM's postgres driver returns raw rows for a RETURNING statement when
// there are any, but falls back to a [rows, affectedCount] tuple when there are
// none. Reading `.length` on the raw result would therefore see 2 for "nothing
// was inserted" — which would make a conflict look like a successful write.
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
 * The single entry point for emitting a Content Engine event.
 *
 * "Emit" means durably accepting a validated event into the transactional
 * outbox — nothing more. Evaluation is deliberately not performed here: running
 * rule selection and effects inside the caller's fact transaction would hold it
 * open across arbitrary work, and a slow or failing evaluator would roll back
 * the fact it was reacting to. `ContentEventDispatcher` delivers after commit.
 *
 * The payload is validated against the vocabulary schema *before* any SQL runs,
 * so a malformed event can never leave a row behind, and the caller's
 * transaction rolls back with the fact it was about to describe.
 *
 * Every write uses the `EntityManager` the caller supplies, never a global
 * repository — that is what makes the event and its fact one transaction.
 */
@Injectable()
export class ContentEventEmitter {
  async emit<Event extends EventName>(
    manager: EntityManager,
    input: EmitContentEventInput<Event>,
  ): Promise<ContentEventOf<Event>> {
    const eventId = input.eventId?.trim();

    if (!eventId) {
      throw new ContentEventValidationError(
        `Event ${String(input.eventName)} was emitted without a stable event ID.`,
      );
    }

    const schema = eventPayloadSchemas[input.eventName];

    if (!schema) {
      throw new ContentEventValidationError(
        `${String(input.eventName)} is not a Content Engine event. ` +
          "Event names are owned by @contentual/content-engine-vocabulary.",
      );
    }

    const parsed = schema.safeParse(input.payload);

    if (!parsed.success) {
      throw new ContentEventValidationError(
        `Payload for ${String(input.eventName)} (${eventId}) is invalid: ` +
          JSON.stringify(parsed.error.issues),
      );
    }

    // Built from parsed.data, never the caller's object: the schemas are strict,
    // so what is stored is exactly what the vocabulary defines.
    const payload = parsed.data as EventPayload<Event>;
    const userId = (payload as { userId: string }).userId;

    const inserted = returnedRows<OutboxRow>(
      await manager.query(INSERT_SQL, [
        eventId,
        input.eventName,
        userId,
        JSON.stringify(payload),
      ]),
    );

    if (inserted.length > 0) {
      return {
        id: eventId,
        eventName: input.eventName,
        userId,
        payload,
      };
    }

    // The ID was already taken. A replay of the same fact is the expected case
    // and is idempotent; anything else means two distinct facts claimed one
    // identity, which would silently drop an event.
    const [existing] = returnedRows<OutboxRow>(
      await manager.query(SELECT_SQL, [eventId]),
    );

    if (!existing) {
      throw new ContentEventCollisionError(
        `Event ${eventId} conflicted on insert but could not be read back.`,
      );
    }

    if (
      existing.eventName !== input.eventName ||
      existing.userId !== userId ||
      !isDeepStrictEqual(existing.payload, payload)
    ) {
      throw new ContentEventCollisionError(
        `Event ID ${eventId} is already held by a different event ` +
          `(${existing.eventName}). Stable event IDs must be unique per fact.`,
      );
    }

    return {
      id: existing.id,
      eventName: input.eventName,
      userId,
      payload,
    };
  }
}
