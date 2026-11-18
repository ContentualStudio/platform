import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as flowNavigation from "./flow-navigation";
import { resolveStage2Back } from "./flow-navigation";

test("Back exits to the dashboard only from the first Stage 2 question", () => {
  assert.deepEqual(resolveStage2Back(0), { destination: "dashboard" });
  assert.deepEqual(resolveStage2Back(3), { stepIndex: 2 });
});

test("successful matching holds the design loading screen for 2.5 seconds", () => {
  const duration = (
    flowNavigation as typeof flowNavigation & {
      COMPLETION_LOADING_DURATION_MS?: number;
    }
  ).COMPLETION_LOADING_DURATION_MS;

  assert.equal(duration, 2_500);
});
