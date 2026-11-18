import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import { contentEventIds } from "./event-ids";
import { ContentEventValidationError } from "./content-event";

// Pins each of the twelve formats once. Every other test in the repo builds
// IDs through `contentEventIds`, so a format change here is the one place
// that breaks.
test("builds the exact stable ID format for every event", () => {
  assert.equal(
    contentEventIds.taskCompleted({
      userId: "u1",
      programmeId: "p1",
      taskId: "t1",
      localDate: "2026-07-28",
    }),
    `${eventNameTokens.taskCompleted}:u1:p1:t1:2026-07-28`,
  );
  assert.equal(
    contentEventIds.taskSkipped({
      userId: "u1",
      programmeId: "p1",
      taskId: "t1",
      localDate: "2026-07-28",
    }),
    `${eventNameTokens.taskSkipped}:u1:p1:t1:2026-07-28`,
  );
  assert.equal(
    contentEventIds.programmeStarted({ userId: "u1", programmeId: "p1" }),
    `${eventNameTokens.programmeStarted}:u1:p1`,
  );
  assert.equal(
    contentEventIds.programmeCompleted({ userId: "u1", programmeId: "p1" }),
    `${eventNameTokens.programmeCompleted}:u1:p1`,
  );
  assert.equal(
    contentEventIds.programmeCountReached({ userId: "u1", count: 3 }),
    `${eventNameTokens.programmeCountReached}:u1:3`,
  );
  assert.equal(
    contentEventIds.streakReached({
      userId: "u1",
      runOrdinal: 2,
      streakLength: 7,
    }),
    `${eventNameTokens.streakReached}:u1:2:7`,
  );
  assert.equal(
    contentEventIds.streakBroken({ userId: "u1", runOrdinal: 2 }),
    `${eventNameTokens.streakBroken}:u1:2`,
  );
  assert.equal(
    contentEventIds.streakResumed({ userId: "u1", runOrdinal: 3 }),
    `${eventNameTokens.streakResumed}:u1:3`,
  );
  assert.equal(
    contentEventIds.weekCompleted({
      userId: "u1",
      programmeId: "p1",
      weekIndex: 2,
    }),
    `${eventNameTokens.weekCompleted}:u1:p1:2`,
  );
  assert.equal(
    contentEventIds.levelChanged({ userId: "u1", changeOrdinal: 1 }),
    `${eventNameTokens.levelChanged}:u1:1`,
  );
  assert.equal(
    contentEventIds.platformConnected({
      userId: "u1",
      platform: "instagram",
      connectionOrdinal: 1,
    }),
    `${eventNameTokens.platformConnected}:u1:instagram:1`,
  );
  assert.equal(
    contentEventIds.followerMilestone({ userId: "u1", tier: 1000 }),
    `${eventNameTokens.followerMilestone}:u1:1000`,
  );
});

test("builds the billing transition ids from the confirming Stripe event", () => {
  assert.equal(
    contentEventIds.subscriptionStarted({ userId: "u1", stripeEventId: "evt_1" }),
    `${eventNameTokens.subscriptionStarted}:u1:evt_1`,
  );
  assert.equal(
    contentEventIds.subscriptionChanged({ userId: "u1", stripeEventId: "evt_2" }),
    `${eventNameTokens.subscriptionChanged}:u1:evt_2`,
  );
  assert.equal(
    contentEventIds.subscriptionEnded({ userId: "u1", stripeEventId: "evt_3" }),
    `${eventNameTokens.subscriptionEnded}:u1:evt_3`,
  );
});

test("covers exactly the events the vocabulary defines", () => {
  assert.deepEqual(
    Object.keys(contentEventIds).sort(),
    Object.keys(eventNameTokens).sort(),
  );
});

test("rejects an empty segment", () => {
  assert.throws(
    () => contentEventIds.programmeStarted({ userId: "u1", programmeId: "" }),
    ContentEventValidationError,
  );
  assert.throws(
    () => contentEventIds.programmeStarted({ userId: "  ", programmeId: "p1" }),
    ContentEventValidationError,
  );
});

test("rejects a segment containing the ':' separator", () => {
  assert.throws(
    () =>
      contentEventIds.taskCompleted({
        userId: "u1",
        programmeId: "p:1",
        taskId: "t1",
        localDate: "2026-07-28",
      }),
    ContentEventValidationError,
  );
});
