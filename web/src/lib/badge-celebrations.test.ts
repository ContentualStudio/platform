import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  badgeArtworkSrc,
  mergePendingCelebrations,
  pendingBadgeCelebrationsSchema,
  type BadgeCelebration,
} from "./badge-celebrations";

function celebration(id: string, key = `badge-${id}`): BadgeCelebration {
  return { id, key, name: `Badge ${id}`, description: null };
}

test("a badge's artwork is named by its key", () => {
  assert.equal(badgeArtworkSrc("foundations-built"), "/brand/badges/foundations-built.png");
  assert.equal(badgeArtworkSrc("10k-gold"), "/brand/badges/10k-gold.png");
});

test("a key that is not a plain slug has no artwork", () => {
  assert.equal(badgeArtworkSrc("../secrets"), null);
  assert.equal(badgeArtworkSrc("Foundations Built"), null);
  assert.equal(badgeArtworkSrc(""), null);
});

test("new celebrations join the end of the queue", () => {
  const merged = mergePendingCelebrations(
    [celebration("1")],
    [celebration("1"), celebration("2")],
    new Set(),
  );

  assert.deepEqual(
    merged.map((item) => item.id),
    ["1", "2"],
  );
});

test("a celebration on screen or dismissed this session is never re-queued", () => {
  const merged = mergePendingCelebrations(
    [],
    [celebration("1"), celebration("2"), celebration("3")],
    new Set(["1", "2"]),
  );

  assert.deepEqual(
    merged.map((item) => item.id),
    ["3"],
  );
});

test("the response schema accepts the API's shape", () => {
  const parsed = pendingBadgeCelebrationsSchema.parse({
    celebrations: [celebration("7", "first-take")],
  });

  assert.equal(parsed.celebrations[0]?.key, "first-take");
  assert.throws(() =>
    pendingBadgeCelebrationsSchema.parse({
      celebrations: [{ ...celebration("7"), name: "" }],
    }),
  );
});
