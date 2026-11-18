import * as assert from "node:assert/strict";
import { test } from "node:test";
import { checkRateLimit } from "./backend";

test("an unconfigured Redis connection allows the request", async () => {
  assert.deepEqual(await checkRateLimit("auth", "ip:203.0.113.10"), {
    allowed: true,
  });
});
