import assert from "node:assert/strict";
import test from "node:test";

import {
  firstTakeV11Manifest,
  FIRST_TAKE_CONTENT_TYPES,
  seedFirstTake,
} from "./first-take-v1.1";

test("the First Take v1.1 manifest contains the locked programme shape", () => {
  assert.equal(firstTakeV11Manifest.programme.slug, "first-take");
  assert.equal(firstTakeV11Manifest.programme.durationDays, 21);
  assert.equal(firstTakeV11Manifest.modules.length, 6);
  assert.equal(firstTakeV11Manifest.lessons.length, 13);
  assert.equal(firstTakeV11Manifest.resources.length, 7);
  assert.equal(firstTakeV11Manifest.insightMoments.length, 4);
  assert.equal(firstTakeV11Manifest.milestones.length, 9);
  assert.equal(firstTakeV11Manifest.tasks.length, 22);
});

test("the First Take schedule preserves day types, publish slots, and authored order", () => {
  const dayTypes = new Map<number, string>();
  const taskKeys = new Set<string>();
  const publishPosts: number[] = [];

  for (const task of firstTakeV11Manifest.tasks) {
    dayTypes.set(task.dayNumber, task.dayType);
    const taskKey = `${task.dayNumber}:${task.orderWithinDay}`;
    assert.equal(taskKeys.has(taskKey), false, `duplicate task ${taskKey}`);
    taskKeys.add(taskKey);

    assert.ok(
      FIRST_TAKE_CONTENT_TYPES.includes(task.contentType),
      `${task.slug} has an unsupported content type`,
    );

    if (task.publishSlot) {
      assert.ok(task.postNumber);
      publishPosts.push(task.postNumber);
    } else {
      assert.equal(task.postNumber, null);
    }
  }

  assert.equal(dayTypes.size, 21);
  assert.deepEqual(
    [...dayTypes.values()].reduce<Record<string, number>>((counts, type) => {
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {}),
    { push: 12, protect: 6, recharge: 3 },
  );
  assert.deepEqual(publishPosts.sort((a, b) => a - b), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);

  const day21 = firstTakeV11Manifest.tasks.filter(
    (task) => task.dayNumber === 21,
  );
  assert.deepEqual(
    day21.map((task) => [task.orderWithinDay, task.postNumber]),
    [
      [1, 9],
      [2, 10],
    ],
  );
});

test("the First Take modules and lesson attachments retain authored order", () => {
  assert.deepEqual(
    firstTakeV11Manifest.modules.map((module) => module.order),
    [1, 2, 3, 4, 5, 6],
  );

  const lessonSlugs = new Set(firstTakeV11Manifest.lessons.map(({ slug }) => slug));
  const moduleLessonSlugs = firstTakeV11Manifest.modules.flatMap((module) =>
    module.lessons.map(({ slug }) => slug),
  );

  assert.equal(moduleLessonSlugs.length, 13);
  assert.equal(new Set(moduleLessonSlugs).size, 13);
  for (const slug of moduleLessonSlugs) {
    assert.equal(lessonSlugs.has(slug), true);
  }

  assert.deepEqual(
    firstTakeV11Manifest.resources.map(({ slug }) => slug),
    [
      "script-skeleton-template",
      "hook-formula-cheatsheet",
      "four-point-self-review-framework",
      "niche-research-list-template",
      "packaging-checklist",
      "weekly-content-schedule",
      "30-day-forward-plan-template",
    ],
  );
});

test("the First Take seed updates stable slugs without duplicating records", async () => {
  type FakePayloadArgs = {
    collection: string;
    data?: Record<string, unknown>;
    id?: string | number;
    where?: { slug: { equals: string } };
  };
  const records = new Map<string, Array<Record<string, unknown>>>();
  let nextId = 1;
  const payload = {
    find: async (args: FakePayloadArgs) => {
      const collection = String(args.collection);
      const slug = args.where?.slug.equals ?? "";
      return {
        docs: (records.get(collection) ?? []).filter(
          (record) => record.slug === slug,
        ),
      };
    },
    create: async (args: FakePayloadArgs) => {
      const collection = String(args.collection);
      const record = { ...(args.data ?? {}), id: nextId++ };
      records.set(collection, [...(records.get(collection) ?? []), record]);
      return record;
    },
    update: async (args: FakePayloadArgs) => {
      const collection = String(args.collection);
      const current = records.get(collection) ?? [];
      const index = current.findIndex((record) => record.id === args.id);
      const record = { ...current[index], ...(args.data ?? {}), id: args.id };
      current[index] = record;
      records.set(collection, current);
      return record;
    },
  };

  const firstRun = await seedFirstTake(payload as never);
  const secondRun = await seedFirstTake(payload as never);

  assert.deepEqual(firstRun.created, {
    programmes: 1,
    lessons: 13,
    modules: 6,
    tasks: 22,
  });
  assert.deepEqual(firstRun.updated, {});
  assert.deepEqual(secondRun.created, {});
  assert.deepEqual(secondRun.updated, {
    programmes: 1,
    lessons: 13,
    modules: 6,
    tasks: 22,
  });
  assert.equal(records.get("programmes")?.length, 1);
  assert.equal(records.get("lessons")?.length, 13);
  assert.equal(records.get("modules")?.length, 6);
  assert.equal(records.get("tasks")?.length, 22);
  assert.equal(firstRun.resourcesAttached, 0);
  assert.equal(firstRun.warnings.length, 1);
});
