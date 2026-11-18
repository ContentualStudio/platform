import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import {
  eventNameTokens,
  type EventName,
} from "@contentual/content-engine-vocabulary";
import {
  ContentEventCollisionError,
  ContentEventValidationError,
  type ContentEvent,
} from "./content-event";
import { ContentEventEmitter } from "./event-emitter";

interface RecordedQuery {
  sql: string;
  parameters: unknown[];
}

// The emitter must never reach a global repository — every write belongs to the
// caller's open transaction. A fake EntityManager is therefore the whole
// contract surface: if the emitter used anything else, these tests would see no
// queries at all.
function fakeManager(responses: unknown[] = []): {
  manager: EntityManager;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  let call = 0;
  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      const response = responses[call];
      call += 1;
      return response ?? [];
    },
  } as unknown as EntityManager;

  return { manager, queries };
}

// One canonical payload per event, so "the emitter accepts everything the
// vocabulary defines" is a real assertion rather than a spot check. Keyed by
// token rather than literal: api/src is scanned for restated vocabulary tokens.
const validPayloads: { [Name in EventName]: Record<string, unknown> } = {
  [eventNameTokens.taskCompleted]: {
    userId: "user-1",
    programmeId: "programme-1",
    taskId: "task-1",
    contentType: "video",
  },
  [eventNameTokens.taskSkipped]: {
    userId: "user-1",
    programmeId: "programme-1",
    taskId: "task-1",
    consecutiveSkipCount: 2,
  },
  [eventNameTokens.programmeStarted]: {
    userId: "user-1",
    programmeId: "programme-1",
  },
  [eventNameTokens.programmeCompleted]: {
    userId: "user-1",
    programmeId: "programme-1",
  },
  [eventNameTokens.programmeCountReached]: { userId: "user-1", count: 3 },
  [eventNameTokens.streakReached]: { userId: "user-1", streakLength: 7 },
  [eventNameTokens.streakBroken]: { userId: "user-1", priorLength: 6 },
  [eventNameTokens.streakResumed]: { userId: "user-1" },
  [eventNameTokens.weekCompleted]: {
    userId: "user-1",
    programmeId: "programme-1",
    weekIndex: 2,
  },
  [eventNameTokens.levelChanged]: {
    userId: "user-1",
    newLevel: "Gold",
    previousLevel: "Silver",
  },
  [eventNameTokens.platformConnected]: {
    userId: "user-1",
    platform: "instagram",
  },
  [eventNameTokens.followerMilestone]: {
    userId: "user-1",
    tier: 1000,
    followerCount: 1042,
  },
  [eventNameTokens.subscriptionStarted]: {
    userId: "user-1",
    tier: "creator",
    foundingCreator: false,
  },
  [eventNameTokens.subscriptionChanged]: {
    userId: "user-1",
    tier: "pro",
    previousTier: "creator",
  },
  [eventNameTokens.subscriptionEnded]: {
    userId: "user-1",
    previousTier: "creator",
  },
};

function insertedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "programme.started:user-1:programme-1",
    eventName: eventNameTokens.programmeStarted,
    userId: "user-1",
    payload: { userId: "user-1", programmeId: "programme-1" },
    ...overrides,
  };
}

test("accepts the canonical payload for every vocabulary event", async () => {
  const emitter = new ContentEventEmitter();

  for (const eventName of Object.keys(validPayloads) as EventName[]) {
    const payload = validPayloads[eventName];
    const { manager, queries } = fakeManager([
      [{ id: `${eventName}:user-1`, eventName, userId: "user-1", payload }],
    ]);

    const event = await emitter.emit(manager, {
      eventId: `${eventName}:user-1`,
      eventName,
      payload: payload as never,
    });

    assert.equal(event.eventName, eventName, eventName);
    assert.deepEqual(event.payload, payload, eventName);
    assert.equal(event.userId, "user-1", eventName);
    assert.equal(queries.length, 1, eventName);
  }
});

test("rejects a payload with a missing field before touching the database", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "programme.started:user-1:programme-1",
        eventName: eventNameTokens.programmeStarted,
        payload: { userId: "user-1" } as never,
      }),
    ContentEventValidationError,
  );
  assert.equal(queries.length, 0);
});

test("rejects a payload with a mistyped field before touching the database", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "streak.reached:user-1",
        eventName: eventNameTokens.streakReached,
        payload: { userId: "user-1", streakLength: "7" } as never,
      }),
    ContentEventValidationError,
  );
  assert.equal(queries.length, 0);
});

test("rejects a payload carrying an extra field", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "programme.started:user-1:programme-1",
        eventName: eventNameTokens.programmeStarted,
        payload: {
          userId: "user-1",
          programmeId: "programme-1",
          invented: true,
        } as never,
      }),
    ContentEventValidationError,
  );
  assert.equal(queries.length, 0);
});

test("rejects an unknown event name", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "made.up:user-1",
        eventName: "made.up" as never,
        payload: { userId: "user-1" } as never,
      }),
    ContentEventValidationError,
  );
  assert.equal(queries.length, 0);
});

test("rejects a blank event ID before touching the database", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "   ",
        eventName: eventNameTokens.programmeStarted,
        payload: { userId: "user-1", programmeId: "programme-1" },
      }),
    ContentEventValidationError,
  );
  assert.equal(queries.length, 0);
});

test("writes the validated envelope through the caller's manager", async () => {
  const emitter = new ContentEventEmitter();
  const { manager, queries } = fakeManager([[insertedRow()]]);

  const event = await emitter.emit(manager, {
    eventId: "programme.started:user-1:programme-1",
    eventName: eventNameTokens.programmeStarted,
    payload: { userId: "user-1", programmeId: "programme-1" },
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO "content_engine_events"/);
  assert.match(queries[0].sql, /ON CONFLICT \("id"\) DO NOTHING/);
  assert.deepEqual(queries[0].parameters, [
    "programme.started:user-1:programme-1",
    eventNameTokens.programmeStarted,
    "user-1",
    JSON.stringify({ userId: "user-1", programmeId: "programme-1" }),
  ]);
  assert.deepEqual(event, {
    id: "programme.started:user-1:programme-1",
    eventName: eventNameTokens.programmeStarted,
    userId: "user-1",
    payload: { userId: "user-1", programmeId: "programme-1" },
  });
});

test("an identical replay returns the existing event without a second row", async () => {
  const emitter = new ContentEventEmitter();
  // Insert conflicts (no returned row), then the existing row is read back.
  const { manager, queries } = fakeManager([[], [insertedRow()]]);

  const event = await emitter.emit(manager, {
    eventId: "programme.started:user-1:programme-1",
    eventName: eventNameTokens.programmeStarted,
    payload: { userId: "user-1", programmeId: "programme-1" },
  });

  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /SELECT/);
  assert.equal(event.id, "programme.started:user-1:programme-1");
  assert.deepEqual(event.payload, {
    userId: "user-1",
    programmeId: "programme-1",
  });
});

test("a stable ID reused for a different payload is an integrity error", async () => {
  const emitter = new ContentEventEmitter();
  const { manager } = fakeManager([
    [],
    [insertedRow({ payload: { userId: "user-1", programmeId: "other" } })],
  ]);

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "programme.started:user-1:programme-1",
        eventName: eventNameTokens.programmeStarted,
        payload: { userId: "user-1", programmeId: "programme-1" },
      }),
    ContentEventCollisionError,
  );
});

test("a stable ID reused for a different event name is an integrity error", async () => {
  const emitter = new ContentEventEmitter();
  const { manager } = fakeManager([
    [],
    [
      insertedRow({
        eventName: eventNameTokens.programmeCompleted,
      }),
    ],
  ]);

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "programme.started:user-1:programme-1",
        eventName: eventNameTokens.programmeStarted,
        payload: { userId: "user-1", programmeId: "programme-1" },
      }),
    ContentEventCollisionError,
  );
});

// A conflict with no readable row means the row vanished between the two
// statements — inside a transaction that cannot happen, so treating it as
// success would hide a real bug.
test("a conflict with no readable row is an integrity error", async () => {
  const emitter = new ContentEventEmitter();
  const { manager } = fakeManager([[], []]);

  await assert.rejects(
    () =>
      emitter.emit(manager, {
        eventId: "programme.started:user-1:programme-1",
        eventName: eventNameTokens.programmeStarted,
        payload: { userId: "user-1", programmeId: "programme-1" },
      }),
    ContentEventCollisionError,
  );
});

// Compile-time only: the value of ContentEvent being a distributive union is
// that a handler switching on `eventName` narrows `payload` with it. A plain
// generic interface would give two independent unions and let a task.completed
// event carry a streak.reached payload, so these assignments are the guard
// against that regression.
test("the event envelope correlates its name with its payload", () => {
  const narrow = (event: ContentEvent): string => {
    switch (event.eventName) {
      case eventNameTokens.programmeStarted:
        // Narrowed: programmeId exists only on this event's payload.
        return event.payload.programmeId;
      case eventNameTokens.streakReached:
        return String(event.payload.streakLength);
      case eventNameTokens.followerMilestone:
        return `${event.payload.tier}/${event.payload.followerCount}`;
      default:
        return event.userId;
    }
  };

  assert.equal(
    narrow({
      id: "programme.started:user-1:programme-1",
      eventName: eventNameTokens.programmeStarted,
      userId: "user-1",
      payload: { userId: "user-1", programmeId: "programme-1" },
    }),
    "programme-1",
  );
  assert.equal(
    narrow({
      id: "streak.reached:user-1",
      eventName: eventNameTokens.streakReached,
      userId: "user-1",
      payload: { userId: "user-1", streakLength: 7 },
    }),
    "7",
  );
});
