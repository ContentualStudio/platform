import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import {
  eventNameTokens,
  eventNames,
  eventPayloadSchemas,
} from "@contentual/content-engine-vocabulary";
import { contentEventIds } from "../event-ids";
import {
  backfillScannerFor,
  backfillUnsupportedReason,
  ruleBackfillScanners,
  unsupportedBackfillEvents,
} from "./backfill-scanners";

interface Capture {
  sql: string;
  parameters: unknown[];
}

// Returns one canned page and records the statement that asked for it.
function fakeManager(rows: readonly unknown[], captured: Capture[]) {
  return {
    async query(sql: string, parameters: unknown[]) {
      captured.push({ sql, parameters });
      return rows;
    },
  } as unknown as EntityManager;
}

test("every event family in the vocabulary has a scanner, keyed by its own name", () => {
  assert.deepEqual(
    [...Object.keys(ruleBackfillScanners), ...Object.keys(unsupportedBackfillEvents)].sort(),
    [...eventNames].sort(),
  );

  // `satisfies Record<EventName, ...>` checks the key set but not that a
  // scanner was filed under its own event — a copy-paste could put the streak
  // scanner under `level.changed` and still compile.
  for (const [eventName, scanner] of Object.entries(ruleBackfillScanners)) {
    assert.equal(scanner.eventName, eventName);
  }
});

test("every candidate carries a payload the vocabulary schema accepts", async () => {
  // One row shaped to satisfy every scanner's SELECT at once; each reads only
  // the columns it asked for and ignores the rest.
  const row = {
    id: "42",
    userId: "user-1",
    programmeId: "programme-1",
    taskId: "task-1",
    localDate: "2026-07-01",
    contentType: "video",
    weekIndex: 2,
    count: "3",
    currentLength: 12,
    runOrdinal: 2,
    level: "Silver",
    changeOrdinal: 1,
    platform: "instagram",
    connectionOrdinal: 1,
    followerCount: 10_000,
    stripeSubscriptionId: "sub_1",
    tier: "creator",
    isFoundingCreator: true,
  };

  for (const eventName of eventNames) {
    if (backfillUnsupportedReason(eventName)) {
      assert.throws(() => backfillScannerFor(eventName), /cannot be backfilled/);
      continue;
    }

    const page = await backfillScannerFor(eventName).scanPage(fakeManager([row], []), null, 10);

    assert.ok(
      page.candidates.length > 0,
      `${eventName} produced no candidate from a fully populated row`,
    );

    for (const candidate of page.candidates) {
      assert.equal(candidate.eventName, eventName);
      assert.equal(candidate.userId, "user-1");

      const parsed = eventPayloadSchemas[eventName].safeParse(candidate.payload);
      assert.ok(
        parsed.success,
        `${eventName} payload rejected: ${JSON.stringify(parsed.error?.issues)}`,
      );
    }
  }
});

// The whole safety story rests on this. Under `every_time` the dedupe key *is*
// the event ID, so a backfill that minted its own IDs would fire a second time
// for a user who already fired live.
test("candidate IDs are the same IDs the live emitter builds", async () => {
  const cases = [
    {
      eventName: eventNameTokens.programmeCompleted,
      row: { id: "1", userId: "u", programmeId: "p" },
      expected: contentEventIds.programmeCompleted({
        userId: "u",
        programmeId: "p",
      }),
    },
    {
      eventName: eventNameTokens.programmeCountReached,
      row: { userId: "u", count: "4" },
      expected: contentEventIds.programmeCountReached({ userId: "u", count: 4 }),
    },
    {
      eventName: eventNameTokens.streakReached,
      row: { userId: "u", currentLength: 7, runOrdinal: 3 },
      expected: contentEventIds.streakReached({
        userId: "u",
        runOrdinal: 3,
        streakLength: 7,
      }),
    },
    {
      eventName: eventNameTokens.levelChanged,
      row: { userId: "u", level: "Gold", changeOrdinal: 2 },
      expected: contentEventIds.levelChanged({ userId: "u", changeOrdinal: 2 }),
    },
    {
      eventName: eventNameTokens.platformConnected,
      row: { id: "1", userId: "u", platform: "instagram", connectionOrdinal: 1 },
      expected: contentEventIds.platformConnected({
        userId: "u",
        platform: "instagram",
        connectionOrdinal: 1,
      }),
    },
    {
      eventName: eventNameTokens.taskCompleted,
      row: {
        id: "1",
        userId: "u",
        programmeId: "p",
        taskId: "t",
        localDate: "2026-07-01",
        contentType: "video",
      },
      expected: contentEventIds.taskCompleted({
        userId: "u",
        programmeId: "p",
        taskId: "t",
        localDate: "2026-07-01",
      }),
    },
  ] as const;

  for (const { eventName, row, expected } of cases) {
    const page = await backfillScannerFor(eventName).scanPage(
      fakeManager([row], []),
      null,
      10,
    );

    assert.equal(page.candidates[0].id, expected, `${eventName} ID mismatch`);
  }
});

test("a date column handed back as a Date still produces the emitter's text ID", async () => {
  const page = await backfillScannerFor(eventNameTokens.taskCompleted).scanPage(
    fakeManager(
      [
        {
          id: "1",
          userId: "u",
          programmeId: "p",
          taskId: "t",
          localDate: new Date("2026-07-01T00:00:00.000Z"),
          contentType: "video",
        },
      ],
      [],
    ),
    null,
    10,
  );

  assert.equal(
    page.candidates[0].id,
    contentEventIds.taskCompleted({
      userId: "u",
      programmeId: "p",
      taskId: "t",
      localDate: "2026-07-01",
    }),
  );
});

test("a follower snapshot yields one candidate per tier it clears, and none it does not", async () => {
  const page = await backfillScannerFor(
    eventNameTokens.followerMilestone,
  ).scanPage(fakeManager([{ userId: "u", followerCount: 1_500 }], []), null, 10);

  // Narrowed on eventName because ContentEvent is a correlated union — the
  // payload's shape is only knowable once the event name is.
  const tiers = page.candidates.map((candidate) =>
    candidate.eventName === eventNameTokens.followerMilestone
      ? candidate.payload.tier
      : null,
  );

  assert.deepEqual(tiers, [100, 1_000]);
});

test("a snapshot below every tier yields no candidates but does not end the scan", async () => {
  const captured: Capture[] = [];
  const rows = Array.from({ length: 2 }, (_, index) => ({
    userId: `u${index}`,
    followerCount: 5,
  }));

  const page = await backfillScannerFor(
    eventNameTokens.followerMilestone,
  ).scanPage(fakeManager(rows, captured), null, 2);

  // An empty page with a live cursor is the case that makes "stop when the page
  // is empty" wrong: later users may still clear a tier.
  assert.deepEqual(page.candidates, []);
  assert.equal(page.cursor, JSON.stringify(["u1"]));
});

test("a short page ends the scan, a full page hands back a cursor", async () => {
  const scanner = backfillScannerFor(eventNameTokens.programmeCompleted);
  const row = (id: string) => ({ id, userId: "u", programmeId: `p${id}` });

  const short = await scanner.scanPage(fakeManager([row("1")], []), null, 2);
  assert.equal(short.cursor, null);

  const full = await scanner.scanPage(
    fakeManager([row("1"), row("2")], []),
    null,
    2,
  );
  assert.equal(full.cursor, JSON.stringify(["2"]));
});

test("a cursor resumes the keyset rather than restarting it", async () => {
  const captured: Capture[] = [];

  await backfillScannerFor(eventNameTokens.programmeCompleted).scanPage(
    fakeManager([], captured),
    JSON.stringify(["17"]),
    50,
  );

  assert.deepEqual(captured[0].parameters, ["17", 50]);
  assert.match(captured[0].sql, /"id" > \$1/);
  assert.match(captured[0].sql, /ORDER BY "id"/);
});

// A backfill must report state, not history. These are the predicates that make
// that true, so they are asserted against the statement rather than trusted.
const livenessPredicates = [
  {
    eventName: eventNameTokens.streakReached,
    predicate: /"brokenAt" IS NULL/,
  },
  {
    eventName: eventNameTokens.streakBroken,
    predicate: /"brokenAt" IS NOT NULL/,
  },
  {
    eventName: eventNameTokens.streakResumed,
    predicate: /"brokenAt" IS NULL/,
  },
  {
    eventName: eventNameTokens.platformConnected,
    predicate: /"disconnectedAt" IS NULL/,
  },
  {
    eventName: eventNameTokens.programmeStarted,
    predicate: /"programmeStartedAt" IS NOT NULL/,
  },
] as const;

for (const { eventName, predicate } of livenessPredicates) {
  test(`${eventName} only scans state that is still true`, async () => {
    const captured: Capture[] = [];

    await backfillScannerFor(eventName).scanPage(
      fakeManager([], captured),
      null,
      10,
    );

    assert.match(captured[0].sql, predicate);
  });
}

test("the families whose payload hides a past value declare it unreconstructible", () => {
  assert.deepEqual(
    backfillScannerFor(eventNameTokens.levelChanged).unreconstructibleFields,
    ["previousLevel"],
  );
  assert.deepEqual(
    backfillScannerFor(eventNameTokens.taskSkipped).unreconstructibleFields,
    ["consecutiveSkipCount"],
  );
  assert.deepEqual(
    backfillScannerFor(eventNameTokens.streakReached).unreconstructibleFields,
    [],
  );
});

test("a level the vocabulary no longer names is dropped rather than coerced", async () => {
  const page = await backfillScannerFor(eventNameTokens.levelChanged).scanPage(
    fakeManager(
      [
        { userId: "u1", level: "Adamantium", changeOrdinal: 1 },
        { userId: "u2", level: "Gold", changeOrdinal: 1 },
      ],
      [],
    ),
    null,
    10,
  );

  assert.deepEqual(
    page.candidates.map((candidate) => candidate.userId),
    ["u2"],
  );
});

test("a user still on their first level has nothing to backfill", async () => {
  const captured: Capture[] = [];

  await backfillScannerFor(eventNameTokens.levelChanged).scanPage(
    fakeManager([], captured),
    null,
    10,
  );

  // Seeding writes changeOrdinal 0 for every user who has ever completed a
  // task; those users never had a level *change*.
  assert.match(captured[0].sql, /"changeOrdinal" > 0/);
});

test("a malformed cursor is refused rather than silently restarting the scan", async () => {
  await assert.rejects(
    () =>
      backfillScannerFor(eventNameTokens.programmeCompleted).scanPage(
        fakeManager([], []),
        JSON.stringify(["a", "b"]),
        10,
      ),
    /Malformed backfill cursor/,
  );
});
