import * as assert from "node:assert/strict";
import { test } from "node:test";
import { profileTimezones } from "../lib/profile-timezones";
import {
  profileResponseSchema,
  profileUpdateSchema,
} from "./onboarding.schema";

const profile = {
  onboardingCompleted: true,
  notifications: {
    dailyTaskNotice: true,
    badgeEarned: false,
    streakAtRisk: true,
    milestoneReached: false,
  },
  preferences: {
    theme: "dark",
  },
  user: {
    id: "user-1",
    email: "creator@example.com",
    image: null,
    name: "Creator",
  },
  stage1: {
    name: "Creator",
    userType: "Independent Creator",
    region: "Nigeria",
    timezone: "Africa/Lagos",
    platforms: ["Instagram"],
    experienceLevel: "Intermediate",
    postingFrequency: "Daily",
    mainGoal: "Grow my audience",
    biggestChallenge: "Staying consistent",
    bio: "I help creators publish.",
  },
};

test("profileResponseSchema preserves profile bio", () => {
  const result = profileResponseSchema.parse(profile);

  assert.equal(result.stage1.bio, "I help creators publish.");
  assert.deepEqual(result.notifications, profile.notifications);
  assert.deepEqual(result.preferences, profile.preferences);
});

test("profileUpdateSchema trims editable profile values", () => {
  assert.deepEqual(
    profileUpdateSchema.parse({
      name: "  James  ",
      bio: "  Creator coach  ",
      region: "  Nigeria  ",
      timezone: "Africa/Lagos",
    }),
    {
      name: "James",
      bio: "Creator coach",
      region: "Nigeria",
      timezone: "Africa/Lagos",
    },
  );
});

test("profileUpdateSchema rejects invalid profile values", () => {
  assert.throws(() => profileUpdateSchema.parse({ name: " " }));
  assert.throws(() => profileUpdateSchema.parse({ bio: "x".repeat(281) }));
  assert.throws(() =>
    profileUpdateSchema.parse({ timezone: "Nowhere/Imaginary" }),
  );
});

test("every profile timezone option is accepted by validation", () => {
  for (const timezone of profileTimezones) {
    const result = profileUpdateSchema.safeParse({
        bio: "",
        name: "Creator",
        region: "Nigeria",
        timezone,
    });

    assert.equal(result.success, true, timezone);
  }
});
