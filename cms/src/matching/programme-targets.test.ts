import assert from "node:assert/strict";
import test from "node:test";
import { payloadProgrammeTargets } from "./programme-targets";

function payloadWith(document: Record<string, unknown>) {
  return {
    find: async ({ collection }: { collection: string }) => ({
      docs: collection === "programmes" ? [document] : [],
    }),
  };
}

test("a Payload programme target carries an immutable graph snapshot", async () => {
  const lookup = payloadProgrammeTargets(
    payloadWith({
      id: "programme-1",
      _status: "published",
      key: "starter",
      lifecycleStatus: "live",
      slug: "starter",
      title: "Starter",
      description: "The first version",
      durationDays: 7,
      experienceLevel: "beginner",
      difficulty: "easy",
      track: "starter",
      updatedAt: "2026-08-27T10:00:00.000Z",
      lessons: [],
    }) as never,
  );

  const target = await lookup.resolve("programme-1");

  assert.ok(target);
  assert.match(target.programmeVersionId, /^pv_[0-9a-f-]+$/);
  assert.doesNotMatch(target.programmeVersionId, /starter@/);
  assert.equal(target.snapshot.programme.title, "Starter");
  assert.deepEqual(target.snapshot.tasks, []);
});

test("republishing creates a new content version identity", async () => {
  const first = await payloadProgrammeTargets(
    payloadWith({
      id: "programme-1",
      _status: "published",
      key: "starter",
      lifecycleStatus: "live",
      slug: "starter",
      title: "Starter v1",
      updatedAt: "2026-08-27T10:00:00.000Z",
    }) as never,
  ).resolve("programme-1");
  const second = await payloadProgrammeTargets(
    payloadWith({
      id: "programme-1",
      _status: "published",
      key: "starter",
      lifecycleStatus: "live",
      slug: "starter",
      title: "Starter v2",
      updatedAt: "2026-08-27T11:00:00.000Z",
    }) as never,
  ).resolve("programme-1");

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.programmeVersionId, second.programmeVersionId);
  assert.equal(first.snapshot.programme.title, "Starter v1");
  assert.equal(second.snapshot.programme.title, "Starter v2");
});

test("the immutable programme key survives an editable slug change", async () => {
  const target = await payloadProgrammeTargets(
    payloadWith({
      id: 1,
      _status: "published",
      key: "starter",
      lifecycleStatus: "live",
      slug: "starter-programme",
      title: "Starter",
      updatedAt: "2026-08-27T10:00:00.000Z",
    }) as never,
  ).resolve(1);

  assert.equal(target?.programmeKey, "starter");
  assert.equal(target?.snapshot.programme.key, "starter");
});
