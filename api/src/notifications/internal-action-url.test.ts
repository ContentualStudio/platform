import * as assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeInternalActionUrl } from "./internal-action-url";

test("accepts canonical internal paths", () => {
  assert.equal(isSafeInternalActionUrl("/dashboard"), true);
  assert.equal(isSafeInternalActionUrl("/dashboard/settings"), true);
  assert.equal(isSafeInternalActionUrl("/"), true);
});

test("rejects external, encoded, escaped, control, and padded paths", () => {
  for (const value of [
    "//evil.example",
    "/\\evil",
    "/%2Fevil",
    "/%252Fevil",
    "/dashboard%20x",
    "/dashboard\nnext",
    " /dashboard",
    "/dashboard ",
  ]) {
    assert.equal(isSafeInternalActionUrl(value), false, value);
  }
});
