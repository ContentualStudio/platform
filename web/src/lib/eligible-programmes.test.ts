import * as assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleProgrammeSchema } from "../schemas/eligible-programme.schema";

const base = {
  slug: "first-take",
  title: "First Take",
  track: "starter",
  durationDays: 21,
  durationLabel: "21 days",
  description: "The entry point.",
  locked: false,
  unlocked: false,
  unlockedAt: null,
  newlyUnlocked: false,
  active: false,
};

test("an eligible programme parses into the shape the card renders", () => {
  const programme = eligibleProgrammeSchema.parse(base);

  assert.equal(programme.slug, "first-take");
  assert.equal(programme.track, "starter");
  assert.equal(programme.active, false);
});

test("a programme with no track parses, so the card can omit the chip", () => {
  const programme = eligibleProgrammeSchema.parse({ ...base, track: null });

  assert.equal(programme.track, null);
});

test("an unlocked programme carries its unlock timestamp", () => {
  const programme = eligibleProgrammeSchema.parse({
    ...base,
    unlocked: true,
    unlockedAt: "2026-09-01T10:00:00.000Z",
    newlyUnlocked: true,
  });

  assert.equal(programme.unlocked, true);
  assert.equal(programme.newlyUnlocked, true);
});

test("a payload missing the slug is rejected rather than rendered without a key", () => {
  const { slug: _slug, ...withoutSlug } = base;

  assert.equal(eligibleProgrammeSchema.safeParse(withoutSlug).success, false);
});

test("a locked programme reaching the list is one the user has unlocked", () => {
  const programme = eligibleProgrammeSchema.parse({
    ...base,
    locked: true,
    unlocked: true,
    unlockedAt: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(programme.locked, true);
  assert.equal(programme.unlocked, true);
});

test("the plan gate defaults open, so an api without it changes nothing", () => {
  const programme = eligibleProgrammeSchema.parse(base);

  assert.equal(programme.minimumTier, "free");
  assert.equal(programme.requiresUpgrade, false);
});

test("a programme above the user's plan carries the tier the card names", () => {
  const programme = eligibleProgrammeSchema.parse({
    ...base,
    minimumTier: "creator",
    requiresUpgrade: true,
  });

  assert.equal(programme.minimumTier, "creator");
  assert.equal(programme.requiresUpgrade, true);
  // Independent of the engine's unlock gate.
  assert.equal(programme.locked, false);
});

test("card targets and the active-programme block default when the api omits them", () => {
  const programme = eligibleProgrammeSchema.parse(base);

  assert.deepEqual(programme.targetPlatforms, []);
  assert.deepEqual(programme.targetContentTypes, []);
  assert.equal(programme.startBlockedByActive, false);
});

test("card targets and the active-programme block parse when present", () => {
  const programme = eligibleProgrammeSchema.parse({
    ...base,
    targetPlatforms: ["instagram", "tiktok"],
    targetContentTypes: ["reel"],
    startBlockedByActive: true,
  });

  assert.deepEqual(programme.targetPlatforms, ["instagram", "tiktok"]);
  assert.equal(programme.startBlockedByActive, true);
});
