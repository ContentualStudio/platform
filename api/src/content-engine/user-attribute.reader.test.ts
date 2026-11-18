import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import { taskProgressOutcomes } from "../programme-tasks/entities/programme-task-progress.entity";
import {
  UserAttributeReader,
  UserAttributeReaderFactory,
} from "./user-attribute.reader";

interface RecordedQuery {
  sql: string;
  parameters: unknown[];
}

function fakeManager(rowsByUser: Record<string, unknown[]>) {
  const queries: RecordedQuery[] = [];

  const manager = {
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      const userId = String(parameters[0]);
      return rowsByUser[userId] ?? [];
    },
  } as unknown as EntityManager;

  return { manager, queries };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    subscription_tier: null,
    user_type: "creator",
    experience_level: "beginner",
    is_founding_creator: false,
    // COUNT() arrives as a bigint string from the postgres driver.
    lifetime_task_completions: "12",
    programmes_completed: "3",
    ...overrides,
  };
}

test("maps profile columns and counts onto the allowlisted attribute names", async () => {
  const { manager } = fakeManager({ "user-1": [row()] });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("user-1", "user_type"), "creator");
  assert.equal(await reader.read("user-1", "experience_level"), "beginner");
  assert.equal(await reader.read("user-1", "lifetime_task_completions"), 12);
  assert.equal(await reader.read("user-1", "programmes_completed"), 3);
});

test("a user with no subscription reads as status none, tier free, not founding", async () => {
  const { manager } = fakeManager({ "user-1": [row()] });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("user-1", "subscription_status"), "none");
  assert.equal(await reader.read("user-1", "subscription_tier"), "free");
  assert.equal(await reader.read("user-1", "is_founding_creator"), false);
});

test("a paid subscription resolves its tier; a lapsed one resolves to free", async () => {
  const { manager } = fakeManager({
    paying: [row({ subscription_status: "active", subscription_tier: "creator" })],
    retrying: [row({ subscription_status: "past_due", subscription_tier: "pro" })],
    lapsed: [row({ subscription_status: "canceled", subscription_tier: "creator" })],
    founding: [row({ is_founding_creator: true })],
  });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("paying", "subscription_tier"), "creator");
  assert.equal(await reader.read("paying", "subscription_status"), "active");
  assert.equal(await reader.read("retrying", "subscription_tier"), "pro");
  assert.equal(await reader.read("lapsed", "subscription_tier"), "free");
  assert.equal(await reader.read("lapsed", "subscription_status"), "canceled");
  assert.equal(await reader.read("founding", "is_founding_creator"), true);
});

test("counts completed task progress rows, not skipped ones", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });

  await new UserAttributeReader(manager).preload("user-1");

  assert.deepEqual(queries[0].parameters, [
    "user-1",
    taskProgressOutcomes.completed,
  ]);
  assert.match(queries[0].sql, /programme_task_progress/);
  assert.match(queries[0].sql, /programme_completion/);
});

test("reads the billing attributes from the tables the Stripe webhook owns", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });

  await new UserAttributeReader(manager).preload("user-1");

  assert.match(queries[0].sql, /LEFT JOIN "billing_account"/);
  assert.match(queries[0].sql, /LEFT JOIN "user_subscription"/);
  assert.match(queries[0].sql, /AS "subscription_status"/);
  assert.match(queries[0].sql, /AS "subscription_tier"/);
});

test("left joins the profile so a user without one still resolves", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });

  await new UserAttributeReader(manager).preload("user-1");

  assert.match(queries[0].sql, /FROM "user"/);
  assert.match(queries[0].sql, /LEFT JOIN "user_profile"/);
});

test("reads no SQL verb other than SELECT", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });

  await new UserAttributeReader(manager).preload("user-1");
  const sql = queries[0].sql.toUpperCase();

  for (const verb of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP"]) {
    assert.ok(!sql.includes(verb), `${verb} must not appear`);
  }
});

test("repeated reads for one user reuse a single preloaded query", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });
  const reader = new UserAttributeReader(manager);

  await reader.read("user-1", "user_type");
  await reader.read("user-1", "experience_level");
  await reader.read("user-1", "programmes_completed");

  assert.equal(queries.length, 1);
});

test("concurrent reads for one user coalesce onto one query", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });
  const reader = new UserAttributeReader(manager);

  await Promise.all([
    reader.read("user-1", "user_type"),
    reader.read("user-1", "experience_level"),
    reader.read("user-1", "lifetime_task_completions"),
  ]);

  assert.equal(queries.length, 1);
});

test("a different user triggers a separate query", async () => {
  const { manager, queries } = fakeManager({
    "user-1": [row({ user_type: "creator" })],
    "user-2": [row({ user_type: "brand" })],
  });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("user-1", "user_type"), "creator");
  assert.equal(await reader.read("user-2", "user_type"), "brand");
  assert.equal(queries.length, 2);
});

test("an unknown user resolves nulls but zero counts", async () => {
  const { manager } = fakeManager({});
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("ghost", "user_type"), null);
  assert.equal(await reader.read("ghost", "experience_level"), null);
  assert.equal(await reader.read("ghost", "subscription_status"), null);
  assert.equal(await reader.read("ghost", "is_founding_creator"), null);
  assert.equal(await reader.read("ghost", "lifetime_task_completions"), 0);
  assert.equal(await reader.read("ghost", "programmes_completed"), 0);
});

test("a user with no profile row resolves null profile fields", async () => {
  const { manager } = fakeManager({
    "user-1": [row({ user_type: null, experience_level: null })],
  });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("user-1", "user_type"), null);
  assert.equal(await reader.read("user-1", "experience_level"), null);
});

test("coerces unusable count values to a finite number", async () => {
  const { manager } = fakeManager({
    "user-1": [
      row({ lifetime_task_completions: null, programmes_completed: "nope" }),
    ],
  });
  const reader = new UserAttributeReader(manager);

  assert.equal(await reader.read("user-1", "lifetime_task_completions"), 0);
  assert.equal(await reader.read("user-1", "programmes_completed"), 0);
});

test("each evaluation run gets a reader with an empty cache", async () => {
  const { manager, queries } = fakeManager({ "user-1": [row()] });
  const factory = new UserAttributeReaderFactory(manager);

  await factory.forEvaluation().read("user-1", "user_type");
  await factory.forEvaluation().read("user-1", "user_type");

  assert.equal(
    queries.length,
    2,
    "a per-run reader must not inherit another run's cached user data",
  );
});
