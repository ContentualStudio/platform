import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import { ContentEventBatch } from "../content-engine/event-batch";
import { fakeEmitter, queryRouter } from "../content-engine/testing/content-event-fakes";
import { GamificationService } from "./gamification.service";
import { baseLevel } from "./levels";

interface StreakState {
  runOrdinal: number;
  currentLength: number;
  longestLength: number;
  lastActiveDate: string;
  runStartedDate: string;
  brokenAt: string | null;
}

interface LevelState {
  level: string;
  changeOrdinal: number;
}

function addDays(date: string, delta: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

// A minimal, stateful in-memory model of the two tables' SQL semantics
// (ON CONFLICT DO NOTHING, the date-gap predicates, "level" <> $next), driven
// entirely through manager.query() the way the service actually calls it.
// This proves orchestration across a sequence of days; the gates themselves
// (real ON CONFLICT / date arithmetic) are proven in the integration suite.
function fakeGamificationManager() {
  let streak: StreakState | null = null;
  let level: LevelState | null = null;

  const query = queryRouter([
    {
      match: (sql) => sql.includes('INSERT INTO "user_streak"'),
      handle: (_sql, params) => {
        const [, localDate] = params as [string, string];
        if (streak) {
          return [[], 0];
        }
        streak = {
          runOrdinal: 1,
          currentLength: 1,
          longestLength: 1,
          lastActiveDate: localDate,
          runStartedDate: localDate,
          brokenAt: null,
        };
        return [{ runOrdinal: 1, currentLength: 1 }];
      },
    },
    {
      match: (sql) => sql.includes('"currentLength" = "currentLength" + 1'),
      handle: (_sql, params) => {
        const [, localDate] = params as [string, string];
        if (!streak || streak.lastActiveDate !== addDays(localDate, -1)) {
          return [[], 0];
        }
        streak.currentLength += 1;
        streak.longestLength = Math.max(streak.longestLength, streak.currentLength);
        streak.lastActiveDate = localDate;
        return [{ runOrdinal: streak.runOrdinal, currentLength: streak.currentLength }];
      },
    },
    {
      match: (sql) => sql.includes('"previous"."runOrdinal" + 1'),
      handle: (_sql, params) => {
        const [, localDate] = params as [string, string];
        if (!streak || !(streak.lastActiveDate < addDays(localDate, -1))) {
          return [[], 0];
        }
        const previous = { ...streak };
        streak = {
          runOrdinal: previous.runOrdinal + 1,
          currentLength: 1,
          longestLength: Math.max(previous.longestLength, 1),
          runStartedDate: localDate,
          lastActiveDate: localDate,
          brokenAt: null,
        };
        return [
          {
            previousRunOrdinal: previous.runOrdinal,
            previousLength: previous.currentLength,
            previousBrokenAt: previous.brokenAt,
            runOrdinal: streak.runOrdinal,
          },
        ];
      },
    },
    {
      match: (sql) => sql.includes('SET "brokenAt" = now()'),
      handle: (_sql, params) => {
        const [, asOfLocalDate] = params as [string, string];
        if (
          !streak ||
          streak.brokenAt !== null ||
          !(streak.lastActiveDate < addDays(asOfLocalDate, -1))
        ) {
          return [[], 0];
        }
        streak.brokenAt = "swept";
        return [{ runOrdinal: streak.runOrdinal, currentLength: streak.currentLength }];
      },
    },
    {
      match: (sql) => sql.includes('INSERT INTO "user_level"'),
      handle: (_sql, params) => {
        const [, seedLevel] = params as [string, string];
        if (level) {
          return [[], 0];
        }
        level = { level: seedLevel, changeOrdinal: 0 };
        return [[], 0];
      },
    },
    {
      match: (sql) => sql.includes("array_position("),
      handle: (_sql, params) => {
        const [, nextLevel, ladder] = params as [string, string, string[]];
        if (!level || ladder.indexOf(nextLevel) <= ladder.indexOf(level.level)) {
          return [[], 0];
        }
        const previousLevel = level.level;
        level.level = nextLevel;
        level.changeOrdinal += 1;
        return [{ previousLevel, changeOrdinal: level.changeOrdinal }];
      },
    },
  ]);

  return {
    query,
    getStreak: () => streak,
    getLevel: () => level,
  };
}

test("the first completion seeds a length-1, run-1 streak.reached", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 1,
  });

  const reached = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.streakReached,
  );
  assert.deepEqual(reached, [
    {
      eventId: "streak.reached:u1:1:1",
      eventName: eventNameTokens.streakReached,
      payload: { userId: "u1", streakLength: 1 },
    },
  ]);
});

test("consecutive local days extend the same run", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 1,
  });
  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-02",
    lifetimeTaskCompletions: 2,
  });

  const reached = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.streakReached,
  );
  assert.deepEqual(
    reached.map((event) => event.eventId),
    ["streak.reached:u1:1:1", "streak.reached:u1:1:2"],
  );
});

test("a second completion the same local day emits no second streak event", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 1,
  });
  const streakEventsBefore = emitter.emitted.length;

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 2,
  });

  assert.equal(emitter.emitted.length, streakEventsBefore);
});

test("a gap breaks and resumes the streak in one call: broken, resumed, reached", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 1,
  });
  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-02",
    lifetimeTaskCompletions: 2,
  });

  // 2026-07-05 is a 2-day gap after 2026-07-02.
  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-05",
    lifetimeTaskCompletions: 3,
  });

  const streakEvents = emitter.emitted
    .filter((event) =>
      [
        eventNameTokens.streakBroken,
        eventNameTokens.streakResumed,
        eventNameTokens.streakReached,
      ].includes(event.eventName as never),
    )
    .slice(-3);

  assert.deepEqual(
    streakEvents.map((event) => event.eventName),
    [
      eventNameTokens.streakBroken,
      eventNameTokens.streakResumed,
      eventNameTokens.streakReached,
    ],
  );
  assert.deepEqual(streakEvents[0]?.payload, { userId: "u1", priorLength: 2 });
  assert.equal(streakEvents[2]?.eventId, "streak.reached:u1:2:1");
});

test("an eager sweep break is not re-emitted by the lazy roll-over", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 1,
  });

  await service.recordStreakBreaks(manager as never, batch, {
    userId: "u1",
    asOfLocalDate: "2026-07-04",
  });

  const brokenBefore = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.streakBroken,
  );
  assert.equal(brokenBefore.length, 1);

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-05",
    lifetimeTaskCompletions: 2,
  });

  const broken = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.streakBroken,
  );
  const resumed = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.streakResumed,
  );
  assert.equal(broken.length, 1, "the lazy roll-over must not re-emit streak.broken");
  assert.equal(resumed.length, 1);
});

test("level.changed fires only when a completion crosses a threshold", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 9,
  });
  assert.equal(
    emitter.emitted.filter((event) => event.eventName === eventNameTokens.levelChanged)
      .length,
    0,
    "9 completions must not cross the Silver threshold",
  );

  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-02",
    lifetimeTaskCompletions: 10,
  });

  const changed = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.levelChanged,
  );
  assert.deepEqual(changed, [
    {
      eventId: "level.changed:u1:1",
      eventName: eventNameTokens.levelChanged,
      payload: { userId: "u1", newLevel: "Silver", previousLevel: baseLevel },
    },
  ]);
});

// lifetimeTaskCompletions is counted before this call, so two concurrent
// completions can race with two different, both-honest counts. If a call
// carrying a smaller (stale) count is applied after a call carrying a larger
// one already promoted the user, it must not overwrite that promotion with a
// demotion — the guard compares ladder rank, not equality, precisely so a
// stale lower count can never win against an already-committed higher level.
test("a stale lower completion count never demotes an already-reached level", async () => {
  const emitter = fakeEmitter();
  const service = new GamificationService(emitter as never);
  const batch = new ContentEventBatch();
  const manager = fakeGamificationManager();

  // The higher count's call is applied first (it "won the race").
  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 10, // Silver
  });

  // A second, stale call carrying a smaller count arrives after.
  await service.recordTaskCompletion(manager as never, batch, {
    userId: "u1",
    localDate: "2026-07-01",
    lifetimeTaskCompletions: 9, // Bronze
  });

  const changed = emitter.emitted.filter(
    (event) => event.eventName === eventNameTokens.levelChanged,
  );
  assert.deepEqual(
    changed.map((event) => event.payload),
    [{ userId: "u1", newLevel: "Silver", previousLevel: baseLevel }],
    "the stale Bronze result must not emit a second, demoting level.changed",
  );
});
