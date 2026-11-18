import assert from "node:assert/strict";
import test from "node:test";

import { userAttributeNames } from "./catalogue";
import {
  resolveUserAttribute,
  userAttributeDefinitions,
  type AppPostgresUserAttributeReader,
  type UserAttributeValueByName,
} from "./user-attributes";

test("defines exactly one typed resolver for every allowlisted attribute", () => {
  assert.deepEqual(Object.keys(userAttributeDefinitions), userAttributeNames);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(userAttributeDefinitions).map(([name, definition]) => [
        name,
        definition.type,
      ]),
    ),
    {
      subscription_status: "string",
      subscription_tier: "string",
      user_type: "string",
      experience_level: "string",
      is_founding_creator: "boolean",
      lifetime_task_completions: "number",
      programmes_completed: "number",
    },
  );
});

test("resolvers read values only through the app-Postgres reader", async () => {
  const values: UserAttributeValueByName = {
    subscription_status: "active",
    subscription_tier: "creator",
    user_type: "creator",
    experience_level: "intermediate",
    is_founding_creator: true,
    lifetime_task_completions: 42,
    programmes_completed: 3,
  };
  const calls: Array<{ userId: string; attribute: string }> = [];
  const reader: AppPostgresUserAttributeReader = {
    async read(userId, attribute) {
      calls.push({ userId, attribute });
      return values[attribute];
    },
  };

  for (const attribute of userAttributeNames) {
    assert.equal(
      await userAttributeDefinitions[attribute].resolve(reader, "user-1"),
      values[attribute],
    );
  }

  assert.deepEqual(
    calls,
    userAttributeNames.map((attribute) => ({ userId: "user-1", attribute })),
  );
});

test("lookup helper resolves an allowlisted attribute", async () => {
  const values: UserAttributeValueByName = {
    subscription_status: null,
    subscription_tier: null,
    user_type: null,
    experience_level: null,
    is_founding_creator: null,
    lifetime_task_completions: null,
    programmes_completed: 5,
  };
  const reader: AppPostgresUserAttributeReader = {
    async read(_userId, attribute) {
      return values[attribute];
    },
  };

  assert.equal(
    await resolveUserAttribute(
      "programmes_completed",
      "user-2",
      reader,
    ),
    5,
  );
});
