import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  resetTestUser,
  type SqlExecutor,
} from "./reset-test-user";

interface RecordedQuery {
  statement: string;
  parameters: unknown[] | undefined;
}

function databaseWithUser(): { database: SqlExecutor; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];

  return {
    database: {
      async query(statement, parameters) {
        queries.push({ statement, parameters });

        if (statement.includes('FROM "user"')) {
          return { rowCount: 1, rows: [{ id: "user-123", email: "test@example.com" }] };
        }

        if (statement.includes('FROM "user_profile"')) {
          return { rowCount: 1, rows: [{ id: "user-123" }] };
        }

        if (statement.includes("FROM session")) {
          return { rowCount: 2, rows: [{ id: "session-1" }, { id: "session-2" }] };
        }

        if (statement.includes("FROM account")) {
          return { rowCount: 1, rows: [{ id: "account-1" }] };
        }

        if (statement.includes("FROM verification")) {
          return { rowCount: 3, rows: [{ id: "verification-1" }] };
        }

        return { rowCount: 1, rows: [{ id: "user-123" }] };
      },
    },
    queries,
  };
}

test("resets a test user and all database records tied to its email or id", async () => {
  const { database, queries } = databaseWithUser();

  const result = await resetTestUser(database, " Test@Example.com ");

  assert.deepEqual(result, {
    status: "deleted",
    userId: "user-123",
    email: "test@example.com",
    deleted: { accounts: 1, profile: 1, sessions: 2, verifications: 3 },
  });
  assert.deepEqual(
    queries.map(({ statement, parameters }) => ({
      operation: statement.split(" ")[0],
      parameters,
    })),
    [
      { operation: "BEGIN", parameters: undefined },
      { operation: "SELECT", parameters: ["test@example.com"] },
      { operation: "DELETE", parameters: ["user-123"] },
      { operation: "DELETE", parameters: ["user-123"] },
      { operation: "DELETE", parameters: ["user-123"] },
      { operation: "DELETE", parameters: ["test@example.com"] },
      { operation: "DELETE", parameters: ["user-123"] },
      { operation: "COMMIT", parameters: undefined },
    ],
  );
});

test("leaves the database unchanged when the email has no user", async () => {
  const queries: RecordedQuery[] = [];
  const database: SqlExecutor = {
    async query(statement, parameters) {
      queries.push({ statement, parameters });
      return { rowCount: 0, rows: [] };
    },
  };

  const result = await resetTestUser(database, "missing@example.com");

  assert.deepEqual(result, { status: "not_found", email: "missing@example.com" });
  assert.deepEqual(
    queries.map(({ statement }) => statement.split(" ")[0]),
    ["BEGIN", "SELECT", "ROLLBACK"],
  );
});
