import * as assert from "node:assert/strict";
import { test } from "node:test";
import { mergeAchievements, nextPossibleBadge, wallOrder, type EarnedBadge } from "./achievements";
import type { BadgeDefinition } from "./badge-catalogue";

const catalogue: BadgeDefinition[] = [
  { category: "consistency", image: "first-take.png", name: "First Take", state: "locked", title: "First task" },
  { category: "consistency", image: "hat-trick.png", name: "Hat Trick", state: "locked", title: "3 in a row" },
  { category: "consistency", image: "warming-up.png", name: "Warming Up", state: "locked", title: "7 in a row" },
  { category: "growth", image: "first-100-fans.png", name: "First 100 Fans", state: "locked", title: "100 followers" },
];

function earned(name: string | null, key: string | null = null, badgeId = `id-${name}`): EarnedBadge {
  return { badgeId, key, name, earnedAt: "2026-10-10T08:00:00.000Z" };
}

test("earned badges are matched to the catalogue by name or key", () => {
  const badges = mergeAchievements(catalogue, [earned("First Take"), earned(null, "first-100-fans")], 0);

  assert.deepEqual(
    badges.map((badge) => [badge.name, badge.state]),
    [
      ["First Take", "earned"],
      ["Hat Trick", "locked"],
      ["Warming Up", "locked"],
      ["First 100 Fans", "earned"],
    ],
  );
  assert.equal(badges[0]!.earnedAt, "2026-10-10T08:00:00.000Z");
});

test("the live streak puts the streak badges in progress, capped at their target", () => {
  const badges = mergeAchievements(catalogue, [earned("First Take")], 5);
  const byName = new Map(badges.map((badge) => [badge.name, badge]));

  assert.deepEqual(byName.get("Hat Trick")!.progress, { current: 3, target: 3 });
  assert.deepEqual(byName.get("Warming Up")!.progress, { current: 5, target: 7 });
  assert.equal(byName.get("First 100 Fans")!.state, "locked");
});

test("an earned badge the catalogue does not know is still listed", () => {
  const badges = mergeAchievements(catalogue, [earned("Mystery Badge")], 0);
  const extra = badges[badges.length - 1]!;

  assert.equal(extra.name, "Mystery Badge");
  assert.equal(extra.state, "earned");
  assert.equal(extra.image, null);
});

test("the next possible badge is the furthest along, else the first locked", () => {
  assert.equal(nextPossibleBadge(mergeAchievements(catalogue, [earned("First Take")], 5))!.name, "Hat Trick");
  assert.equal(
    nextPossibleBadge(mergeAchievements(catalogue, [earned("First Take"), earned("Hat Trick")], 5))!.name,
    "Warming Up",
  );
  assert.equal(nextPossibleBadge(mergeAchievements(catalogue, [earned("First Take")], 0))!.name, "Hat Trick");
  assert.equal(
    nextPossibleBadge(mergeAchievements(catalogue, catalogue.map((badge) => earned(badge.name)), 0)),
    null,
  );
});

test("the wall lists earned, then in progress, then locked", () => {
  const order = wallOrder(mergeAchievements(catalogue, [earned("First 100 Fans")], 2)).map((badge) => badge.name);

  assert.deepEqual(order, ["First 100 Fans", "Hat Trick", "Warming Up", "First Take"]);
});
