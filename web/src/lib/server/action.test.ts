import * as assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { defineServerAction } from "./action";
import { ActionFailure, isNamedFailure, sharedFailureCodes } from "./result";

// `isNamedFailure` is the rule that decides reported-or-not, and both wrappers
// share it. Asserting on it directly is what makes that decision testable
// without standing up a PostHog client.
test("a named failure is an answer; anything else is a bug to report", () => {
  assert.equal(isNamedFailure(new ActionFailure("CODE", "message")), true);
  assert.equal(isNamedFailure(new Error("socket hang up")), false);
  assert.equal(isNamedFailure("a thrown string"), false);
  assert.equal(isNamedFailure(undefined), false);
});

test("a successful action answers with its data", async () => {
  const action = defineServerAction({
    name: "succeeds",
    failureMessage: "unused",
    handler: async () => ({ id: "programme-1" }),
  });

  assert.deepEqual(await action(), {
    ok: true,
    data: { id: "programme-1" },
  });
});

test("input is parsed with the supplied schema before the handler runs", async () => {
  let seen: unknown;
  const action = defineServerAction({
    name: "parses",
    input: z.object({ weeklyCommitment: z.number() }),
    failureMessage: "unused",
    handler: async (input) => {
      seen = input;
      return "done";
    },
  });

  await action({ weeklyCommitment: 3 });

  assert.deepEqual(seen, { weeklyCommitment: 3 });
});

// A Server Action is a public endpoint: its argument is untrusted input, not a
// promise the client keeps.
test("input that does not match the schema never reaches the handler", async () => {
  let ran = false;
  const action = defineServerAction({
    name: "rejects",
    input: z.object({ weeklyCommitment: z.number() }),
    failureMessage: "That is not a valid commitment.",
    handler: async () => {
      ran = true;
      return "done";
    },
  });

  const result = await action({ weeklyCommitment: "three" } as never);

  assert.equal(ran, false);
  assert.deepEqual(result, {
    ok: false,
    code: sharedFailureCodes.invalidInput,
    message: "That is not a valid commitment.",
  });
});

// A deliberate, named failure is the action working as designed: the caller gets
// the api's own code and message rather than the wrapper's generic one.
test("a named failure is passed through with its own code", async () => {
  const action = defineServerAction({
    name: "refuses",
    failureMessage: "generic",
    handler: async () => {
      throw new ActionFailure("STAGE2_MATCH_FAILED", "We couldn't match you.");
    },
  });

  assert.deepEqual(await action(), {
    ok: false,
    code: "STAGE2_MATCH_FAILED",
    message: "We couldn't match you.",
  });
});

test("an unexpected throw becomes the shared failure code", async () => {
  const action = defineServerAction({
    name: "completeStage2",
    failureMessage: "We couldn't match your programme. Try again.",
    handler: async () => {
      throw new Error("socket hang up");
    },
  });

  const result = await action();

  assert.deepEqual(result, {
    ok: false,
    code: sharedFailureCodes.unexpected,
    message: "We couldn't match your programme. Try again.",
  });
});

// The thrown value can carry an upstream response body or a stack. The user gets
// the prepared message; the detail goes to PostHog.
test("an unexpected failure leaks nothing about the error", async () => {
  const action = defineServerAction({
    name: "leaks",
    failureMessage: "Something went wrong.",
    handler: async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.4:5432 password=hunter2");
    },
  });

  const serialised = JSON.stringify(await action());

  for (const leaked of ["ECONNREFUSED", "10.0.0.4", "hunter2"]) {
    assert.ok(!serialised.includes(leaked), `${leaked} must not reach the caller`);
  }
});

// A rejected promise out of a Server Action is an unhandled rejection in the
// caller; the contract is that it always resolves to a result.
test("the action never rejects", async () => {
  const action = defineServerAction({
    name: "throws",
    failureMessage: "Something went wrong.",
    handler: async () => {
      throw new Error("boom");
    },
  });

  await assert.doesNotReject(() => action());
});
