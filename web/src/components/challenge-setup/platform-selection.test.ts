import * as assert from "node:assert/strict";
import { test } from "node:test";
import { togglePlatformSelection } from "./platform-selection";

test("a third platform is prevented and reports the selection limit", () => {
  assert.deepEqual(
    togglePlatformSelection(["Instagram", "TikTok"], "YouTube"),
    {
      selection: ["Instagram", "TikTok"],
      limitReached: true,
    },
  );
});
