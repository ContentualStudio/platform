import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  stage2AnswersSchema,
  stage2PartialAnswersSchema,
} from "./challenge-setup.schema";

test("web validation rejects more than two focus platforms", () => {
  const result = stage2AnswersSchema.safeParse({
    platforms: ["Instagram", "TikTok", "YouTube"],
    postingGoal: "Daily",
    weeklyCommitment: 3,
    nicheDefined: "Partially",
    contentType: "Educational",
    followerRange: "101–500",
    instagramConnected: false,
    milestone: "Reach 5,000 followers",
  });

  assert.equal(result.success, false);
});

test("web can save two platforms before asking which one is primary", () => {
  assert.equal(
    stage2PartialAnswersSchema.safeParse({
      platforms: ["Instagram", "TikTok"],
    }).success,
    true,
  );
});

test("a step save never carries a primaryPlatform the user did not answer", () => {
  // `.default(null)` survives `.partial()` in zod, so a shared field would make
  // every unrelated step post a null and erase the stored primary platform.
  assert.deepEqual(
    stage2PartialAnswersSchema.parse({ postingGoal: "Daily" }),
    { postingGoal: "Daily" },
  );
});

test("milestone is required before completion", () => {
  const result = stage2AnswersSchema.safeParse({
    platforms: ["Instagram"],
    postingGoal: "Daily",
    weeklyCommitment: 5,
    availableDays: ["Monday"],
    sawTestimonial: true,
    nicheDefined: "Yes",
    contentType: "Educational",
    followerRange: "0–100",
    instagramConnected: false,
    milestone: "",
  });

  assert.equal(result.success, false);
});

test("a full answer set still defaults an absent primaryPlatform to null", () => {
  const parsed = stage2AnswersSchema.parse({
    platforms: ["Instagram"],
    postingGoal: "Daily",
    weeklyCommitment: 5,
    availableDays: ["Monday"],
    sawTestimonial: true,
    nicheDefined: "Yes",
    contentType: "Educational",
    followerRange: "0–100",
    instagramConnected: false,
    milestone: "Reach 5,000 followers",
  });

  assert.equal(parsed.primaryPlatform, null);
});
