import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeContentVersions1784950000000 } from "./migrations/1784950000000-ProgrammeContentVersions";
import { ProgrammeMatchingSnapshots1784930000000 } from "./migrations/1784930000000-ProgrammeMatchingSnapshots";
import { AssignmentAttemptsAndProgrammeVersions1784970000000 } from "./migrations/1784970000000-AssignmentAttemptsAndProgrammeVersions";
import { JourneyAssignmentScope1784990000000 } from "./migrations/1784990000000-JourneyAssignmentScope";
import { ProgrammeMatchingTargetEligibility1785000000000 } from "./migrations/1785000000000-ProgrammeMatchingTargetEligibility";

test("published matching history rejects both updates and deletes", async () => {
  const statements: string[] = [];
  const runner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [];
    },
  };

  await new ProgrammeMatchingSnapshots1784930000000().up(runner as never);

  const triggerSql = statements
    .filter((statement) => statement.includes("CREATE TRIGGER"))
    .join("\n");

  assert.ok(
    /BEFORE UPDATE OR DELETE ON "programme_matching_setup_versions"/.test(
      triggerSql,
    ),
  );
  assert.ok(
    /BEFORE UPDATE OR DELETE ON "programme_matching_rules"/.test(triggerSql),
  );
  assert.ok(
    /REVOKE ALL ON "programme_matching_setup_versions" FROM PUBLIC/.test(
      statements.join("\n"),
    ),
  );
  assert.ok(
    /REVOKE ALL ON "programme_matching_rules" FROM PUBLIC/.test(
      statements.join("\n"),
    ),
  );
});

test("programme content history rejects both updates and deletes", async () => {
  const statements: string[] = [];
  const runner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [];
    },
  };

  await new ProgrammeContentVersions1784950000000().up(runner as never);

  const allSql = statements.join("\n");
  assert.match(
    allSql,
    /BEFORE UPDATE OR DELETE ON "programme_content_versions"/,
  );
  assert.match(
    allSql,
    /REVOKE UPDATE, DELETE ON "programme_content_versions" FROM "content_mirror_writer"/,
  );
  assert.match(
    allSql,
    /GRANT SELECT, INSERT ON "programme_content_versions" TO "content_mirror_writer"/,
  );
  assert.doesNotMatch(
    allSql,
    /GRANT .*DELETE ON "programme_content_versions"/,
  );
});

test("assignment cutover only accepts pre-materialized complete programme graphs", async () => {
  const statements: string[] = [];
  const runner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [];
    },
  };

  await new AssignmentAttemptsAndProgrammeVersions1784970000000().up(
    runner as never,
  );

  const allSql = statements.join("\n");
  assert.doesNotMatch(allSql, /INSERT INTO "programme_content_versions"/);
  assert.doesNotMatch(allSql, /FROM "programme" p/);
  assert.match(allSql, /jsonb_typeof\(v\."snapshot"->'modules'\) <> 'array'/);
  assert.match(allSql, /Cannot finish programme version cutover/);
});

test("journey progress and completion gates are scoped to an assignment", async () => {
  const statements: string[] = [];
  const runner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [];
    },
  };

  await new JourneyAssignmentScope1784990000000().up(runner as never);

  const allSql = statements.join("\n");
  for (const table of [
    "programme_task_progress",
    "programme_week_completion",
    "programme_completion",
  ]) {
    assert.match(allSql, new RegExp(`ALTER TABLE "${table}"[\\s\\S]*"assignmentId"`));
  }
  assert.match(
    allSql,
    /UQ_programme_completion_assignment.*"assignmentId"/s,
  );
  assert.match(
    allSql,
    /UQ_programme_task_progress_assignment_day.*"assignmentId"/s,
  );
});

test("matching target eligibility has a fail-closed application database boundary", async () => {
  const statements: string[] = [];
  const runner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [];
    },
  };

  const migration = new ProgrammeMatchingTargetEligibility1785000000000();
  await migration.up(runner as never);
  await migration.down(runner as never);

  const source = statements.join("\n");
  assert.match(source, /CREATE TABLE "programme_matching_target_eligibility"/);
  assert.match(source, /INSERT INTO "programme_matching_target_eligibility"/);
  assert.match(source, /FROM "programme"/);
  assert.match(
    source,
    /GRANT SELECT, INSERT, UPDATE ON "programme_matching_target_eligibility" TO "content_mirror_writer"/,
  );
  assert.match(
    source,
    /GRANT SELECT ON "programme_assignment" TO "content_mirror_writer"/,
  );
  assert.match(
    source,
    /REVOKE SELECT ON "programme_assignment" FROM "content_mirror_writer"/,
  );
  assert.match(source, /DROP TABLE "programme_matching_target_eligibility"/);
});
