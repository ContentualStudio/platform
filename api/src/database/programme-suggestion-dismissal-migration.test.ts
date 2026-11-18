import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeSuggestionDismissal1785130000000 } from "./migrations/1785130000000-ProgrammeSuggestionDismissal";
import { recordingQueryRunner } from "./testing/recording-query-runner";

test("up creates one dismissal per suggestion, owned by the user", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ProgrammeSuggestionDismissal1785130000000().up(runner);
  const combined = sql.join("\n");

  for (const fragment of [
    `"programme_suggestion_dismissal"`,
    `PRIMARY KEY ("suggestionId")`,
    `REFERENCES "engine_programme_suggestion" ("id")`,
    `FK_programme_suggestion_dismissal_user`,
  ]) {
    assert.ok(combined.includes(fragment), `migration must create ${fragment}`);
  }
});

test("down drops the table", async () => {
  const { runner, sql } = recordingQueryRunner();

  await new ProgrammeSuggestionDismissal1785130000000().down(runner);

  assert.ok(
    sql.join("\n").includes(`DROP TABLE IF EXISTS "programme_suggestion_dismissal"`),
  );
});
