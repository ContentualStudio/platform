import type { QueryRunner } from "typeorm";

// A QueryRunner that records the SQL a migration executes instead of running
// it. Migration tests use it to pin the column set, constraints and indexes a
// migration is responsible for, with no database involved — the real schema is
// exercised against Postgres by each domain's integration suite.
export function recordingQueryRunner(): { runner: QueryRunner; sql: string[] } {
  const sql: string[] = [];
  const runner = {
    query: async (statement: string) => {
      sql.push(statement);
      return [];
    },
  } as unknown as QueryRunner;

  return { runner, sql };
}
