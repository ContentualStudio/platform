import * as assert from "node:assert/strict";
import { test } from "node:test";
import { addAdmin, removeAdmin, type SqlExecutor } from "./admin-account";

function recorder(responses: { rowCount: number; rows: Record<string, unknown>[] }[]) {
  const statements: { sql: string; parameters?: unknown[] }[] = [];
  const database: SqlExecutor = {
    async query(sql, parameters) {
      statements.push({ sql, parameters });
      return responses.shift() ?? { rowCount: 0, rows: [] };
    },
  };

  return { database, statements };
}

test("adding an admin normalises the email and defaults the name", async () => {
  const { database, statements } = recorder([
    { rowCount: 1, rows: [{ id: "a-1" }] },
  ]);

  const result = await addAdmin(database, "  Team@Contentual.Test ");

  assert.deepEqual(result, {
    status: "created",
    id: "a-1",
    email: "team@contentual.test",
  });
  assert.deepEqual(statements[0].parameters?.slice(1), [
    "team",
    "team@contentual.test",
  ]);
});

test("adding an existing admin reports it rather than duplicating", async () => {
  const { database } = recorder([{ rowCount: 0, rows: [] }]);

  assert.deepEqual(await addAdmin(database, "team@contentual.test"), {
    status: "exists",
    email: "team@contentual.test",
  });
});

test("an invalid email is refused before touching the database", async () => {
  const { database, statements } = recorder([]);

  await assert.rejects(addAdmin(database, "not-an-email"));
  assert.equal(statements.length, 0);
});

test("removing an admin ends their sessions inside one transaction", async () => {
  const { database, statements } = recorder([
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [] },
    { rowCount: 1, rows: [{ id: "a-1" }] },
    { rowCount: 0, rows: [] },
  ]);

  assert.deepEqual(await removeAdmin(database, "team@contentual.test"), {
    status: "removed",
    email: "team@contentual.test",
    sessions: 2,
  });
  assert.equal(statements[0].sql, "BEGIN");
  assert.equal(statements[statements.length - 1].sql, "COMMIT");
});
