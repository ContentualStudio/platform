import * as assert from "node:assert/strict";
import { test } from "node:test";
import { levelNames } from "@contentual/content-engine-vocabulary";
import { baseLevel, levelForCompletions, levelThresholds } from "./levels";

test("thresholds are strictly ascending and start at 0", () => {
  assert.equal(levelThresholds[0]?.minCompletions, 0);
  for (let index = 1; index < levelThresholds.length; index += 1) {
    assert.ok(
      levelThresholds[index]!.minCompletions >
        levelThresholds[index - 1]!.minCompletions,
      "thresholds must strictly increase",
    );
  }
});

// A sixth vocabulary level breaks this test, forcing levels.ts to be
// retuned before it can ship.
test("the threshold level set equals the vocabulary's level names", () => {
  assert.deepEqual(
    [...levelThresholds.map((threshold) => threshold.level)].sort(),
    [...levelNames].sort(),
  );
});

test("levelForCompletions resolves the exact boundary at each threshold", () => {
  for (const threshold of levelThresholds) {
    assert.equal(levelForCompletions(threshold.minCompletions), threshold.level);

    if (threshold.minCompletions > 0) {
      const lower = levelThresholds.filter(
        (candidate) => candidate.minCompletions < threshold.minCompletions,
      );
      const previous = lower[lower.length - 1];
      assert.equal(
        levelForCompletions(threshold.minCompletions - 1),
        previous?.level,
      );
    }
  }
});

test("negative completions clamp to the base level", () => {
  assert.equal(levelForCompletions(-5), baseLevel);
  assert.equal(levelForCompletions(0), baseLevel);
});
