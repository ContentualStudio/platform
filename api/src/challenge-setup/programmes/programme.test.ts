import * as assert from "node:assert/strict";
import { test } from "node:test";
import { matchingFields } from "@contentual/programme-matching-vocabulary";
import { followerRangeOptions } from "../challenge-setup.schemas";
import {
  buildMatchingProfile,
  type MatchingProfileSource,
} from "./matching-profile";
import { matchAgainstSetup } from "./programme-matcher";
import {
  FIRST_TAKE_FIXTURE_KEY,
  firstTakeFallbackSetup,
} from "./programme-matching.testing";
import { scheduleDayOne } from "./schedule";

// The shadow-parity table. The released matcher put every complete,
// schema-valid profile on First Take through an explicit catch-all; the first
// CMS-authored setup does the same through an explicit fallback. These
// fixtures deliberately spread across user types, platform mixes, both
// weeklyCommitment extremes and every follower range, so the two matchers
// cannot agree by accident — and so a future authored rule that starts
// capturing one of them turns a named test red rather than passing silently.
const fixtures: Array<{ id: string; input: MatchingProfileSource }> = [
  {
    id: "independent creator, just getting started, smallest audience",
    input: {
      stage1: {
        name: "Ada",
        userType: "Independent Creator",
        region: "Nigeria",
        timezone: "Africa/Lagos",
        platforms: ["Instagram"],
        experienceLevel: "Just getting started (0–3 months)",
        postingFrequency: "Rarely",
        mainGoal: "Be more consistent",
        biggestChallenge: "Staying consistent",
      },
      stage2: {
        platforms: ["Instagram"],
        postingGoal: "Just getting started",
        weeklyCommitment: 1,
        availableDays: ["Monday"],
        sawTestimonial: true,
        nicheDefined: "Not yet",
        contentType: "Personal Brand",
        followerRange: "0–100",
        instagramConnected: false,
        milestone: "",
      },
    },
  },
  {
    id: "experienced business owner with a large following",
    input: {
      stage1: {
        name: "Bruno",
        userType: "Business Owner",
        region: "Germany",
        timezone: "Europe/Berlin",
        platforms: ["Instagram", "YouTube", "LinkedIn"],
        experienceLevel: "Experienced (2+ years)",
        postingFrequency: "Daily",
        mainGoal: "Build my business",
        biggestChallenge: "Finding time",
      },
      stage2: {
        platforms: ["YouTube", "LinkedIn"],
        postingGoal: "Daily",
        weeklyCommitment: 7,
        availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        sawTestimonial: true,
        nicheDefined: "Yes",
        contentType: "Business",
        followerRange: "10,000+",
        instagramConnected: true,
        milestone: "Ten thousand qualified leads",
      },
    },
  },
  {
    id: "marketing manager across several Stage 1 and Stage 2 platforms",
    input: {
      stage1: {
        name: "Chidi",
        userType: "Marketing Manager",
        region: "United Kingdom",
        timezone: "Europe/London",
        platforms: ["TikTok", "Facebook", "X / Twitter", "LinkedIn"],
        experienceLevel: "Intermediate (6–18 months)",
        postingFrequency: "A few times a week",
        mainGoal: "Increase engagement",
        biggestChallenge: "Running out of ideas",
      },
      stage2: {
        platforms: ["X (Twitter)", "Pinterest"],
        postingGoal: "3–4 times per week",
        weeklyCommitment: 4,
        availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday"],
        sawTestimonial: false,
        nicheDefined: "Partially",
        contentType: "Educational",
        followerRange: "1,001–5,000",
        instagramConnected: false,
        milestone: "Grow the brand channel",
      },
    },
  },
  {
    id: "on-and-off creator, mid-low follower range",
    input: {
      stage1: {
        name: "Dami",
        userType: "Independent Creator",
        region: "Canada",
        timezone: "America/Toronto",
        platforms: ["YouTube"],
        experienceLevel: "On-and-off",
        postingFrequency: "A few times a month",
        mainGoal: "Grow my audience",
        biggestChallenge: "Editing content",
      },
      stage2: {
        platforms: ["YouTube", "Other"],
        postingGoal: "1–2 times per week",
        weeklyCommitment: 2,
        availableDays: ["Monday", "Tuesday"],
        sawTestimonial: false,
        nicheDefined: "Partially",
        contentType: "Vlogs",
        followerRange: "101–500",
        instagramConnected: false,
        milestone: "Publish twice a week without burning out",
      },
    },
  },
  {
    id: "consistent beginner approaching the first thousand",
    input: {
      stage1: {
        name: "Esi",
        userType: "Independent Creator",
        region: "Ghana",
        timezone: "Africa/Accra",
        platforms: ["Instagram", "TikTok"],
        experienceLevel: "Consistent beginner (3–6 months)",
        postingFrequency: "Weekly",
        mainGoal: "Improve my content",
        biggestChallenge: "Growing an audience",
      },
      stage2: {
        platforms: ["TikTok"],
        postingGoal: "5 times per week",
        weeklyCommitment: 5,
        availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        sawTestimonial: true,
        nicheDefined: "Yes",
        contentType: "Tutorials",
        followerRange: "501–1,000",
        instagramConnected: true,
        milestone: "Cross one thousand followers",
      },
    },
  },
  {
    id: "business owner in the top band below ten thousand",
    input: {
      stage1: {
        name: "Farrah",
        userType: "Business Owner",
        region: "Australia",
        timezone: "Australia/Sydney",
        platforms: ["Facebook", "Instagram"],
        experienceLevel: "Intermediate (6–18 months)",
        postingFrequency: "Daily",
        mainGoal: "Increase engagement",
        biggestChallenge: "Running out of ideas",
      },
      stage2: {
        platforms: ["Facebook", "Instagram"],
        postingGoal: "Daily",
        weeklyCommitment: 6,
        availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        sawTestimonial: false,
        nicheDefined: "Yes",
        contentType: "Product Reviews",
        followerRange: "5,001–10,000",
        instagramConnected: true,
        milestone: "Convert followers into repeat customers",
      },
    },
  },
];

function profileFor(input: MatchingProfileSource) {
  const built = buildMatchingProfile(input);
  assert.ok(built.valid, `expected a valid matching profile: ${JSON.stringify(built)}`);
  return built.profile;
}

for (const fixture of fixtures) {
  test(`every launch profile matches First Take: ${fixture.id}`, () => {
    const result = matchAgainstSetup(
      profileFor(fixture.input),
      firstTakeFallbackSetup(),
    );

    assert.equal(result.trace.selectedProgrammeKey, FIRST_TAKE_FIXTURE_KEY);
    assert.equal(result.trace.selectedProgrammeVersionId, "first-take-v1");
    assert.equal(result.trace.fallbackUsed, true);
    assert.equal(result.trace.multipleRulesQualified, false);
    assert.deepEqual(
      result.trace.considered,
      [],
      "the first setup has no normal rules to consider",
    );
  });
}

test("the matching profile carries only catalogue fields, never free text", () => {
  for (const fixture of fixtures) {
    const profile = profileFor(fixture.input);

    assert.deepEqual(
      Object.keys(profile).sort(),
      [...matchingFields].sort(),
      `${fixture.id}: the profile is exactly the authorable vocabulary`,
    );
    assert.ok(
      !JSON.stringify(profile).includes(fixture.input.stage2.milestone) ||
        fixture.input.stage2.milestone === "",
      `${fixture.id}: the written milestone never reaches matching`,
    );
  }
});

test("a single selected platform is its own primary; two need an explicit choice", () => {
  const single = profileFor(fixtures[0].input);
  const pair = profileFor(fixtures[5].input);

  assert.equal(single.selectedPlatforms.length, 1);
  assert.equal(single.primaryPlatform, single.selectedPlatforms[0]);
  assert.equal(pair.selectedPlatforms.length, 2);
  assert.equal(
    pair.primaryPlatform,
    null,
    "a legacy two-platform row has no primary until it is chosen or backfilled",
  );
});

test("an explicitly chosen primary platform is honoured", () => {
  const profile = profileFor({
    ...fixtures[5].input,
    primaryPlatform: "Instagram",
  });

  assert.equal(profile.primaryPlatform, "Instagram");
});

test("a primary platform the user did not select is refused, not trusted", () => {
  const profile = profileFor({
    ...fixtures[5].input,
    primaryPlatform: "LinkedIn",
  });

  assert.equal(profile.primaryPlatform, null);
});

test("the fixture table covers every Stage 2 follower range", () => {
  const covered = new Set(
    fixtures.map((fixture) => fixture.input.stage2.followerRange),
  );

  assert.deepEqual([...covered].sort(), [...followerRangeOptions].sort());
});

test("the fixture table covers both weeklyCommitment extremes", () => {
  const commitments = fixtures.map(
    (fixture) => fixture.input.stage2.weeklyCommitment,
  );

  assert.ok(commitments.includes(1), "minimum weekly commitment is covered");
  assert.ok(commitments.includes(7), "maximum weekly commitment is covered");
});

test("matching is deterministic and never mutates its input", () => {
  const input = fixtures[0].input;
  const before = JSON.stringify(input);
  const setup = firstTakeFallbackSetup();

  const first = matchAgainstSetup(profileFor(input), setup);
  const second = matchAgainstSetup(profileFor(input), setup);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
});

test("Day 1 is anchored to the start of the user's next local day", () => {
  // 2026-07-13T20:00:00Z is already 2026-07-14 in Sydney (UTC+10), so the
  // next local day is the 15th at local midnight = 2026-07-14T14:00:00Z.
  const now = new Date("2026-07-13T20:00:00Z");
  const day1 = scheduleDayOne(now, "Australia/Sydney");

  assert.equal(day1.toISOString(), "2026-07-14T14:00:00.000Z");
});

test("Day 1 respects a western timezone's own calendar day", () => {
  // Same instant is still 2026-07-13 13:00 in LA (UTC-7); next local day is
  // the 14th at local midnight = 2026-07-14T07:00:00Z.
  const now = new Date("2026-07-13T20:00:00Z");
  const day1 = scheduleDayOne(now, "America/Los_Angeles");

  assert.equal(day1.toISOString(), "2026-07-14T07:00:00.000Z");
});

test("Day 1 falls back cleanly to UTC", () => {
  const now = new Date("2026-07-13T20:00:00Z");
  const day1 = scheduleDayOne(now, "UTC");

  assert.equal(day1.toISOString(), "2026-07-14T00:00:00.000Z");
});
