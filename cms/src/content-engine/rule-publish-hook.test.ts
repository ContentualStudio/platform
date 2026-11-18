import assert from "node:assert/strict";
import test from "node:test";
import { ValidationError } from "payload";

import {
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
} from "@contentual/content-engine-vocabulary";

import { validateEngineRuleBeforePublish } from "./rule-publish-hook";

const draft = { _status: "draft" } as const;
const published = { _status: "published" } as const;

const completeRule = {
  triggerEvent: eventNameTokens.taskCompleted,
  conditions: [],
  effectType: effectTypeTokens.inAppMessage,
  message: "Nice work",
  dedupeScope: dedupeScopeTokens.oncePerUser,
  active: true,
};

function runHook(args: {
  data: Record<string, unknown>;
  originalDoc?: Record<string, unknown>;
  operation?: "create" | "update";
}) {
  return validateEngineRuleBeforePublish({
    data: args.data,
    operation: args.operation ?? "update",
    originalDoc: args.originalDoc,
  } as never);
}

test("leaves an incomplete draft saveable", () => {
  const data = { ...draft, name: "Half-written rule" };

  assert.deepEqual(runHook({ data }), data);
});

test("publishes a complete valid rule unchanged", () => {
  const data = { ...published, ...completeRule };

  assert.deepEqual(runHook({ data }), data);
});

test("rejects an invalid publish attempt with a Payload validation error", () => {
  assert.throws(
    () =>
      runHook({
        data: {
          ...published,
          ...completeRule,
          effectType: effectTypeTokens.grantCall,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(
        error.data.errors.map((fieldError) => fieldError.message),
        ["grant_call is not available in v1"],
      );
      return true;
    },
  );
});

test("merges a partial update with the original document before validating", () => {
  // Publishing from the admin UI sends only the changed fields, so validating
  // `data` alone would reject a rule whose effect parameter is untouched.
  const data = { ...published, active: true };
  const originalDoc = { ...draft, ...completeRule, active: false };

  assert.deepEqual(runHook({ data, originalDoc }), data);
});

test("uses the incoming value when a partial update overwrites the original", () => {
  assert.throws(
    () =>
      runHook({
        data: { ...published, message: "   " },
        originalDoc: { ...draft, ...completeRule },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(
        error.data.errors.map((fieldError) => fieldError.message),
        ["in-app-message requires a message"],
      );
      return true;
    },
  );
});

test("validates when the status is only on the original document", () => {
  // An update to an already-published rule need not resend `_status`.
  assert.throws(
    () =>
      runHook({
        data: { message: "   " },
        originalDoc: { ...published, ...completeRule },
      }),
    ValidationError,
  );
});

test("does not validate an edit that leaves the rule a draft", () => {
  const data = { message: "   " };

  assert.deepEqual(
    runHook({ data, originalDoc: { ...draft, ...completeRule } }),
    data,
  );
});

test("reports each problem against the field that caused it", () => {
  assert.throws(
    () =>
      runHook({
        data: {
          ...published,
          ...completeRule,
          triggerEvent: "post.viral",
          message: undefined,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(error.data.errors, [
        { message: "post.viral is not a known event", path: "triggerEvent" },
        { message: "in-app-message requires a message", path: "message" },
      ]);
      return true;
    },
  );
});
