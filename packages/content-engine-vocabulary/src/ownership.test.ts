import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  findVocabularyLiteralViolations,
  scanWorkspaceVocabularyOwnership,
} from "../scripts/check-vocabulary-ownership";

test("reports a vocabulary token redefined as a string literal", () => {
  assert.deepEqual(
    findVocabularyLiteralViolations([
      {
        filePath: "api/src/content-engine/emitter.ts",
        sourceText: 'const eventName = "task.completed";',
      },
      {
        filePath: "api/src/content-engine/imported.ts",
        sourceText:
          'import { eventNames } from "@contentual/content-engine-vocabulary";',
      },
    ]),
    [
      {
        filePath: "api/src/content-engine/emitter.ts",
        line: 1,
        token: "task.completed",
      },
    ],
  );
});

test("ignores generated files, which restate tokens by construction", () => {
  // payload-types.ts is emitted from the Payload config, whose own option lists
  // are mapped from these tuples. Flagging it would demand hand-editing a
  // generated file on every codegen run.
  assert.deepEqual(
    findVocabularyLiteralViolations([
      {
        filePath: "cms/src/payload-types.ts",
        sourceText: "export type Effect = 'award_badge';",
      },
    ]),
    [],
  );
});

test("current workspaces contain no vocabulary redefinitions", async () => {
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  assert.deepEqual(await scanWorkspaceVocabularyOwnership(repositoryRoot), []);
});
