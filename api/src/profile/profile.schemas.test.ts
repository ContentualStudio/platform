import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  notificationPreferencesSchema,
  profileUpdateSchema,
  stage1AnswersSchema,
  stage1PartialAnswersSchema,
  themePreferenceSchema,
} from "./profile.schemas";

const notificationPreferences = {
  dailyTaskNotice: true,
  badgeEarned: false,
  streakAtRisk: true,
  milestoneReached: false,
};

const validAnswers = {
  name: "James",
  userType: "Independent Creator",
  region: "United States",
  timezone: "America/New_York",
  platforms: ["Instagram", "TikTok"],
  experienceLevel: "Just getting started (0–3 months)",
  postingFrequency: "Daily",
  mainGoal: "Grow my audience",
  biggestChallenge: "Staying consistent",
};

test("stage1AnswersSchema accepts a fully answered submission", () => {
  assert.deepEqual(stage1AnswersSchema.parse(validAnswers), validAnswers);
});

test("stage1AnswersSchema rejects an unrecognized timezone", () => {
  assert.throws(() =>
    stage1AnswersSchema.parse({
      ...validAnswers,
      timezone: "Not/A_Zone",
    }),
  );
});

test("stage1AnswersSchema rejects an empty platforms selection", () => {
  assert.throws(() =>
    stage1AnswersSchema.parse({
      ...validAnswers,
      platforms: [],
    }),
  );
});

test("stage1AnswersSchema rejects an out-of-enum single-select value", () => {
  assert.throws(() =>
    stage1AnswersSchema.parse({
      ...validAnswers,
      userType: "Astronaut",
    }),
  );
});

test("stage1PartialAnswersSchema accepts a single answered field", () => {
  assert.deepEqual(stage1PartialAnswersSchema.parse({ name: "James" }), {
    name: "James",
  });
});

test("stage1PartialAnswersSchema accepts an empty object", () => {
  assert.deepEqual(stage1PartialAnswersSchema.parse({}), {});
});

test("stage1PartialAnswersSchema still validates a field's value when present", () => {
  assert.throws(() =>
    stage1PartialAnswersSchema.parse({ userType: "Astronaut" }),
  );
  assert.throws(() =>
    stage1PartialAnswersSchema.parse({ timezone: "Not/A_Zone" }),
  );
});

test("profileUpdateSchema trims and accepts editable profile fields", () => {
  assert.deepEqual(
    profileUpdateSchema.parse({
      name: "  James Creator  ",
      bio: "  I teach creators to publish consistently.  ",
      region: "  Nigeria  ",
      timezone: "Africa/Lagos",
    }),
    {
      name: "James Creator",
      bio: "I teach creators to publish consistently.",
      region: "Nigeria",
      timezone: "Africa/Lagos",
    },
  );
});

test("profileUpdateSchema rejects an empty display name", () => {
  assert.throws(() => profileUpdateSchema.parse({ name: "   " }));
});

test("profileUpdateSchema rejects a bio longer than 280 characters", () => {
  assert.throws(() => profileUpdateSchema.parse({ bio: "a".repeat(281) }));
});

test("profileUpdateSchema rejects an unrecognized timezone", () => {
  assert.throws(() =>
    profileUpdateSchema.parse({ timezone: "Somewhere/Imaginary" }),
  );
});

test("notificationPreferencesSchema accepts all four boolean preferences", () => {
  assert.deepEqual(
    notificationPreferencesSchema.parse(notificationPreferences),
    notificationPreferences,
  );
});

test("notificationPreferencesSchema rejects incomplete or non-boolean payloads", () => {
  assert.throws(() =>
    notificationPreferencesSchema.parse({ dailyTaskNotice: true }),
  );
  assert.throws(() =>
    notificationPreferencesSchema.parse({
      ...notificationPreferences,
      badgeEarned: "yes",
    }),
  );
});

test("themePreferenceSchema accepts only supported theme values", () => {
  assert.deepEqual(themePreferenceSchema.parse({ theme: "dark" }), {
    theme: "dark",
  });
  assert.throws(() => themePreferenceSchema.parse({ theme: "sepia" }));
});
