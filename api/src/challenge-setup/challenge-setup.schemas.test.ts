import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  stage2AnswersSchema,
  stage2PartialAnswersSchema,
} from "./challenge-setup.schemas";

const validAnswers = {
  platforms: ["Instagram"],
  postingGoal: "Daily",
  weeklyCommitment: 5,
  availableDays: ["Monday", "Wednesday", "Friday"],
  sawTestimonial: true,
  nicheDefined: "Yes",
  contentType: "Educational",
  followerRange: "1,001–5,000",
  instagramConnected: false,
  milestone: "Reach 5,000 followers",
} as const;

test("Stage 2 rejects more than two focus platforms", () => {
  const result = stage2AnswersSchema.safeParse({
    ...validAnswers,
    platforms: ["Instagram", "TikTok", "YouTube"],
  });

  assert.equal(result.success, false);
});

test("Instagram connection remains optional but milestone is required", () => {
  assert.equal(stage2AnswersSchema.safeParse(validAnswers).success, true);

  const withoutMilestone = stage2AnswersSchema.safeParse({
    ...validAnswers,
    milestone: "",
  });

  assert.equal(withoutMilestone.success, false);
});

test("two focus platforms require an explicit primary platform", () => {
  const result = stage2AnswersSchema.safeParse({
    ...validAnswers,
    platforms: ["Instagram", "TikTok"],
  });

  assert.equal(result.success, false);
  assert.equal(
    result.success ? undefined : result.error.issues[0]?.path[0],
    "primaryPlatform",
  );
});

test("saving two platforms succeeds before the next step collects their primary", () => {
  assert.equal(
    stage2PartialAnswersSchema.safeParse({
      platforms: ["Instagram", "TikTok"],
    }).success,
    true,
  );
});

test("an explicit primary platform must be one of the selected platforms", () => {
  assert.equal(
    stage2AnswersSchema.safeParse({
      ...validAnswers,
      platforms: ["Instagram", "TikTok"],
      primaryPlatform: "TikTok",
    }).success,
    true,
  );
  assert.equal(
    stage2AnswersSchema.safeParse({
      ...validAnswers,
      platforms: ["Instagram", "TikTok"],
      primaryPlatform: "YouTube",
    }).success,
    false,
  );
});

test("a partial save omits primaryPlatform rather than defaulting it to null", () => {
  // The default belongs to the full-answers schema only. Sharing the defaulted
  // field would make every step save carry `primaryPlatform: null`, erasing an
  // answer the user already gave — the write path has no way to tell that null
  // apart from a deliberate clearing.
  assert.deepEqual(
    stage2PartialAnswersSchema.parse({ postingGoal: "Daily" }),
    { postingGoal: "Daily" },
  );
});

test("a partial save can still clear the primary platform deliberately", () => {
  assert.deepEqual(
    stage2PartialAnswersSchema.parse({
      platforms: ["TikTok"],
      primaryPlatform: null,
    }),
    { platforms: ["TikTok"], primaryPlatform: null },
  );
});
