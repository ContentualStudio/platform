import type {
  EventName,
  EventPayload,
} from "@contentual/content-engine-vocabulary";

// One event's envelope, for a single known event name.
export interface ContentEventOf<Event extends EventName> {
  readonly id: string;
  readonly eventName: Event;
  readonly userId: string;
  readonly payload: EventPayload<Event>;
}

// The envelope every Content Engine consumer sees.
//
// This is distributive (`Event extends EventName ? ... : never`) rather than a
// plain generic interface, and that is the whole point. An interface
// parameterised by the full union would give `eventName: EventName` and
// `payload: EventPayload<EventName>` as two *independent* unions, so a handler
// that checks `event.eventName` would learn nothing about `event.payload` — it
// could pair `task.completed` with a `streak.reached` payload and still
// typecheck. Distributing produces a union of correlated members, one per event,
// instead, so switching on `eventName` narrows `payload` to exactly the shape
// the vocabulary defines for it.
export type ContentEvent<Event extends EventName = EventName> =
  Event extends EventName ? ContentEventOf<Event> : never;

// The payload did not match its event's schema, or the event ID was unusable.
// Thrown before any SQL runs, so the caller's transaction rolls back with
// nothing written.
export class ContentEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentEventValidationError";
  }
}

// A stable event ID already exists carrying different data. Two distinct facts
// cannot share an identity: silently keeping the first would drop the second
// event entirely, so this is surfaced rather than swallowed.
export class ContentEventCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentEventCollisionError";
  }
}
