import * as assert from "node:assert/strict";
import { test } from "node:test";
import { isBigserialId } from "./bigserial-id";

test("a positive integer that fits a bigint is an id", () => {
  assert.equal(isBigserialId("1"), true);
  assert.equal(isBigserialId("123456789012345678"), true);
});

test("anything that cannot name a bigserial row is not an id", () => {
  for (const value of ["", "0", "007", "-1", "1.5", "abc", "1234567890123456789"]) {
    assert.equal(isBigserialId(value), false, value);
  }
});
