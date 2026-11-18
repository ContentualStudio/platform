import * as assert from "node:assert/strict";
import { test } from "node:test";
import { getDashboardRenderTime } from "./dashboard-render-time";

test("dashboard waits for request time before reading the wall clock", async () => {
  const order: string[] = [];
  const expected = new Date("2026-08-10T15:00:00.000Z");

  const actual = await getDashboardRenderTime(
    async () => {
      order.push("request");
    },
    () => {
      order.push("clock");
      return expected;
    },
  );

  assert.deepEqual(order, ["request", "clock"]);
  assert.equal(actual, expected);
});
