import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  CompletionSuggestionResolver,
  selectSuggestionWinner,
} from "./completion-suggestion-resolver";
import { CompletionSuggestionEvaluator } from "./completion-suggestion-evaluator";

const candidate = (
  id: string,
  priority: number,
  ruleId = id,
  programmeId = "live",
) => ({ id, priority, ruleId, programmeId });
test("lowest priority wins regardless of insertion order", () => {
  assert.equal(
    selectSuggestionWinner(
      [candidate("1", 90), candidate("2", 5)],
      new Set(["live"]),
    )?.id,
    "2",
  );
});
test("ties use stable rule identity rather than insertion order", () => {
  const rows = [candidate("1", 5, "z"), candidate("2", 5, "a")];
  assert.equal(selectSuggestionWinner(rows, new Set(["live"]))?.id, "2");
  assert.equal(
    selectSuggestionWinner([...rows].reverse(), new Set(["live"]))?.id,
    "2",
  );
});
test("missing and inactive programmes fall through; no eligible target means no winner", () => {
  const rows = [candidate("1", 1, "a", "retired"), candidate("2", 10)];
  assert.equal(selectSuggestionWinner(rows, new Set(["live"]))?.id, "2");
  assert.equal(selectSuggestionWinner(rows, new Set()), null);
  assert.equal(selectSuggestionWinner([], new Set(["live"])), null);
});
test("replay leaves an existing resolution untouched", async () => {
  const resolver = new CompletionSuggestionResolver(
    {
      transaction: async (run: (manager: unknown) => Promise<void>) =>
        run({
          query: async (sql: string) =>
            sql.includes('FROM "programme_completion_suggestion"')
              ? [{ eventId: "done" }]
              : [],
        }),
    } as never,
    {
      listActiveProgrammesWithIdentity: async () => {
        throw new Error("must not reselect");
      },
    } as never,
  );
  await resolver.resolve({
    id: "done",
    userId: "user",
    eventName: "programme.completed",
    payload: {},
  } as never);
});
test("evaluation failure does not finalize; successful completion does", async () => {
  const calls: string[] = [];
  const event = {
    id: "done",
    userId: "user",
    eventName: "programme.completed",
    payload: {},
  } as never;
  const failing = new CompletionSuggestionEvaluator(
    {
      evaluate: async () => {
        throw new Error("retry");
      },
    } as never,
    {
      resolve: async () => {
        calls.push("resolve");
      },
    } as never,
  );
  await assert.rejects(failing.evaluate(event), /retry/);
  assert.equal(calls.length, 0);
  const succeeding = new CompletionSuggestionEvaluator(
    {
      evaluate: async () => {
        calls.push("evaluate");
      },
    } as never,
    {
      resolve: async () => {
        calls.push("resolve");
      },
    } as never,
  );
  await succeeding.evaluate(event);
  assert.deepEqual(calls, ["evaluate", "resolve"]);
  calls.length = 0;
  await succeeding.evaluate({
    ...(event as object),
    eventName: "task.completed",
  } as never);
  assert.deepEqual(calls, ["evaluate"]);
});

test("resolver stores the eligible winner slug and never writes suggestion effects or enrolments", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const resolver = new CompletionSuggestionResolver(
    {
      transaction: async (run: (manager: unknown) => Promise<void>) =>
        run({
          query: async (sql: string, params: unknown[]) => {
            queries.push({ sql, params });
            if (sql.includes('FROM "engine_programme_suggestion"'))
              return [candidate("1", 1, "a", "retired"), candidate("2", 10)];
            return [];
          },
        }),
    } as never,
    {
      listActiveProgrammesWithIdentity: async () => [
        { sourceDocumentId: "live", programme: { id: "live-slug" } },
      ],
    } as never,
  );
  await resolver.resolve({
    id: "done",
    userId: "user",
    eventName: "programme.completed",
    payload: {},
  } as never);
  const writes = queries.filter((row) => row.sql.includes("INSERT"));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params, ["user", "done", "2", "live-slug"]);
});

test("resolver records no winner so a replay cannot resurrect a suggestion", async () => {
  let saved: unknown[] | undefined;
  const resolver = new CompletionSuggestionResolver(
    {
      transaction: async (run: (manager: unknown) => Promise<void>) =>
        run({
          query: async (sql: string, params: unknown[]) => {
            if (sql.includes('FROM "engine_programme_suggestion"'))
              return [candidate("1", 1)];
            if (sql.includes("INSERT")) saved = params;
            return [];
          },
        }),
    } as never,
    { listActiveProgrammesWithIdentity: async () => [] } as never,
  );
  await resolver.resolve({
    id: "done",
    userId: "user",
    eventName: "programme.completed",
    payload: {},
  } as never);
  assert.deepEqual(saved, ["user", "done", null, null]);
});
