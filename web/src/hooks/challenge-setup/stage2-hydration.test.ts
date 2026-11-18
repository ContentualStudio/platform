import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ChallengeSetupStatus } from "../../schemas/challenge-setup.schema";
import {
  buildFinalStage2SavePayload,
  findResumeIndex,
  hydrateStage2Answers,
  resolvePrimaryPlatformForSelection,
  stage2StepPayload,
} from "./stage2-hydration";

type SavedAnswers = ChallengeSetupStatus["answers"];

const emptySaved: SavedAnswers = {
  platforms: null,
  primaryPlatform: null,
  postingGoal: null,
  weeklyCommitment: null,
  availableDays: null,
  sawTestimonial: null,
  nicheDefined: null,
  contentType: null,
  followerRange: null,
  instagramConnected: null,
  milestone: null,
};

test("a single saved platform resumes at posting goal", () => {
  const answers = hydrateStage2Answers({
    ...emptySaved,
    platforms: ["Instagram"],
  });

  assert.equal(answers.primaryPlatform, undefined);
  assert.equal(findResumeIndex(answers), 1);
});

test("a saved primary hydrates and resume moves past platforms", () => {
  const answers = hydrateStage2Answers({
    ...emptySaved,
    platforms: ["Instagram", "YouTube"],
    primaryPlatform: "Instagram",
  });

  assert.equal(answers.primaryPlatform, "Instagram");
  assert.equal(findResumeIndex(answers), 1);
});

test("resolvePrimaryPlatformForSelection picks the sole platform", () => {
  assert.equal(
    resolvePrimaryPlatformForSelection(["Instagram"], "TikTok"),
    "Instagram",
  );
});

test("resolvePrimaryPlatformForSelection keeps a valid explicit primary", () => {
  assert.equal(
    resolvePrimaryPlatformForSelection(
      ["Instagram", "TikTok"],
      "TikTok",
    ),
    "TikTok",
  );
});

test("resolvePrimaryPlatformForSelection defaults to the first selection", () => {
  assert.equal(
    resolvePrimaryPlatformForSelection(["Instagram", "TikTok"], null),
    "Instagram",
  );
});

test("an ordinary step sends only its own field", () => {
  assert.deepEqual(stage2StepPayload("postingGoal", "Daily", {}), {
    postingGoal: "Daily",
  });
});

test("the platforms step persists an inferred primary when one platform is selected", () => {
  assert.deepEqual(stage2StepPayload("platforms", ["Instagram"], {}), {
    platforms: ["Instagram"],
    primaryPlatform: "Instagram",
  });
});

test("the platforms step persists the first selection as primary for two platforms", () => {
  assert.deepEqual(
    stage2StepPayload("platforms", ["Instagram", "TikTok"], {}),
    {
      platforms: ["Instagram", "TikTok"],
      primaryPlatform: "Instagram",
    },
  );
});

test("narrowing the platforms clears a primary they no longer contain", () => {
  assert.deepEqual(
    stage2StepPayload("platforms", ["TikTok"], {
      platforms: ["Instagram", "TikTok"],
      primaryPlatform: "Instagram",
    }),
    { platforms: ["TikTok"], primaryPlatform: "TikTok" },
  );
});

test("a still-valid primary survives a platforms change", () => {
  assert.deepEqual(
    stage2StepPayload("platforms", ["Instagram", "YouTube"], {
      platforms: ["Instagram"],
      primaryPlatform: "Instagram",
    }),
    { platforms: ["Instagram", "YouTube"], primaryPlatform: "Instagram" },
  );
});

test("the final save replays every answered field including inferred primary", () => {
  assert.deepEqual(
    buildFinalStage2SavePayload({
      availableDays: ["Monday", "Wednesday"],
      contentType: "Educational",
      followerRange: "0–100",
      instagramConnected: false,
      milestone: "Reach 5,000 followers",
      nicheDefined: "Yes",
      platforms: ["Instagram", "TikTok"],
      postingGoal: "Daily",
      sawTestimonial: true,
      weeklyCommitment: 3,
    }),
    {
      availableDays: ["Monday", "Wednesday"],
      contentType: "Educational",
      followerRange: "0–100",
      instagramConnected: false,
      milestone: "Reach 5,000 followers",
      nicheDefined: "Yes",
      platforms: ["Instagram", "TikTok"],
      postingGoal: "Daily",
      primaryPlatform: "Instagram",
      sawTestimonial: true,
      weeklyCommitment: 3,
    },
  );
});

test("an unanswered field is never written as an explicit null", () => {
  assert.deepEqual(stage2StepPayload("primaryPlatform", undefined, {}), {});
});
