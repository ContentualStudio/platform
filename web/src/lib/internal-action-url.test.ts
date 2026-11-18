import * as assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeInternalActionUrl } from "./internal-action-url";

test("accepts same-origin canonical paths", () => {
  assert.equal(isSafeInternalActionUrl("/dashboard"), true);
  assert.equal(isSafeInternalActionUrl("/achievements"), true);
});

test("rejects redirect-like and encoded paths", () => {
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
