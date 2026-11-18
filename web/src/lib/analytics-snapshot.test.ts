import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyticsSnapshotResponseSchema,
  followerDeltaShare,
  formatFollowerDelta,
  formatFollowerHero,
  toDashboardAnalyticsState,
} from "./analytics-snapshot";

test("a disconnected response produces a connect state without metrics", () => {
  assert.deepEqual(
    toDashboardAnalyticsState({ connected: false, syncing: false, snapshot: null }),
    { kind: "disconnected" },
  );
});

test("a connected response with no snapshot produces a neutral history state", () => {
  assert.deepEqual(
    toDashboardAnalyticsState({ connected: true, syncing: false, snapshot: null }),
    { kind: "no-history" },
  );
});

test("a snapshot response preserves the current value and signed delta", () => {
  assert.deepEqual(
    toDashboardAnalyticsState({
      connected: true,
      syncing: false,
      snapshot: {
        connectedSince: "2025-10-01T12:00:00.000Z",
        followerDeltaWeek: -25,
        followers: 975,
        latestDay: null,
      },
    }),
    {
      kind: "ready",
      snapshot: {
        connectedSince: "2025-10-01T12:00:00.000Z",
        followerDeltaWeek: -25,
        followers: 975,
        latestDay: null,
      },
    },
  );
});

test("follower delta formatting communicates positive, negative, and flat trends", () => {
  assert.equal(formatFollowerDelta(250), "+250 this week");
  assert.equal(formatFollowerDelta(-25), "-25 this week");
  assert.equal(formatFollowerDelta(0), "No change this week");
});

test("the challenge followers card shows a signed hero number", () => {
  assert.equal(formatFollowerHero(200, 1200), "+200");
  assert.equal(formatFollowerHero(-25, 975), "-25");
  assert.equal(formatFollowerHero(0, 1000), "0");
  assert.equal(formatFollowerHero(null, 1200), "1,200");
});

test("week-on-week change is a share of the current follower count", () => {
  assert.equal(followerDeltaShare(200, 1000), 20);
  assert.equal(followerDeltaShare(-25, 1000), 3);
  assert.equal(followerDeltaShare(null, 1000), 0);
  assert.equal(followerDeltaShare(50, 0), 0);
});

test("a response from an api without the syncing flag reads as not syncing", () => {
  const parsed = analyticsSnapshotResponseSchema.parse({
    connected: true,
    snapshot: null,
  });

  assert.equal(parsed.syncing, false);
});
