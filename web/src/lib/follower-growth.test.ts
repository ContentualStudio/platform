import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  followerTicks,
  growthWindowRange,
  growthWindowTicks,
  followerGrowthResponseSchema,
  growthChange,
  growthWindowPoints,
  type ConnectedFollowerGrowth,
} from "./follower-growth";

const growth: ConnectedFollowerGrowth = {
  connected: true,
  today: "2026-10-31",
  points: [
    { date: "2026-08-01", followers: 800 },
    { date: "2026-10-01", followers: 1_000 },
    { date: "2026-10-02", followers: 1_020 },
    { date: "2026-10-25", followers: 1_150 },
    { date: "2026-10-31", followers: 1_200 },
  ],
};

test("a window counts back from the user's today, today included", () => {
  assert.deepEqual(
    growthWindowPoints(growth, 7).map(({ day, value }) => ({ day, value })),
    [
      { day: "Oct 25", value: 1_150 },
      { day: "Oct 31", value: 1_200 },
    ],
  );
  // 30 days ending Oct 31 starts on Oct 2, so Oct 1 falls outside.
  assert.deepEqual(
    growthWindowPoints(growth, 30).map((point) => point.value),
    [1_020, 1_150, 1_200],
  );
  // 90 days ending Oct 31 starts on Aug 3, so Aug 1 falls outside.
  assert.equal(growthWindowPoints(growth, 90).length, 4);
});

test("day labels never shift with the viewer's timezone", () => {
  const [point] = growthWindowPoints(
    { connected: true, today: "2026-01-01", points: [{ date: "2026-01-01", followers: 1 }] },
    7,
  );
  assert.equal(point?.day, "Jan 1");
});

test("the change is the latest in-window value minus the earliest", () => {
  assert.deepEqual(
    growthChange([
      { time: 0, day: "Oct 1", value: 1_000 },
      { time: 0, day: "Oct 31", value: 1_200 },
    ]),
    { change: 200, percent: 20 },
  );
  assert.deepEqual(growthChange([{ time: 0, day: "Oct 1", value: 500 }]), {
    change: 0,
    percent: 0,
  });
  assert.deepEqual(growthChange([]), { change: 0, percent: 0 });
});

test("the response schema rejects a malformed or impossible date", () => {
  for (const today of ["31/10/2026", "2026-13-45"]) {
    assert.throws(() =>
      followerGrowthResponseSchema.parse({ connected: true, today, points: [] }),
    );
  }
});

test("a disconnected response carries no history", () => {
  assert.deepEqual(followerGrowthResponseSchema.parse({ connected: false }), {
    connected: false,
  });
  assert.throws(() =>
    followerGrowthResponseSchema.parse({ connected: false, today: "2026-10-31" }),
  );
});

test("the window spans its full length ending today", () => {
  const [start, end] = growthWindowRange("2026-10-31", 30);

  assert.equal(new Date(start).toISOString().slice(0, 10), "2026-10-02");
  assert.equal(new Date(end).toISOString().slice(0, 10), "2026-10-31");
});

test("axis ticks count back from today so the last tick is today", () => {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  assert.equal(growthWindowTicks("2026-10-31", 7).length, 7);
  assert.deepEqual(growthWindowTicks("2026-10-31", 30).map(day), [
    "2026-10-03",
    "2026-10-10",
    "2026-10-17",
    "2026-10-24",
    "2026-10-31",
  ]);
  assert.equal(day(growthWindowTicks("2026-10-31", 90).at(-1) ?? 0), "2026-10-31");
});

test("follower ticks are round, padded around the data, and never negative", () => {
  assert.deepEqual(followerTicks([455]), [440, 450, 460, 470]);
  assert.deepEqual(followerTicks([1_000, 1_200]), [800, 1_000, 1_200, 1_400]);
  assert.deepEqual(followerTicks([0, 3]), [0, 5, 10, 15]);
});
