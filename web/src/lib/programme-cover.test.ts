import * as assert from "node:assert/strict";
import { test } from "node:test";
import { coverForProgramme, programmeCoverOrNull } from "./programme-cover";

test("known programmes use their cover art", () => {
  assert.equal(
    coverForProgramme("15-day-jumpstart"),
    "/brand/15-day-jumpstart-cover.png",
  );
  assert.equal(
    coverForProgramme("30-day-foundation"),
    "/brand/30-day-foundation-cover.png",
  );
});

test("unknown programmes fall back to the shared hero", () => {
  assert.equal(
    coverForProgramme("first-take"),
    "/brand/challenge-hero-bg.jpg",
  );
});

test("a programme without its own artwork has no cover rather than the shared hero", () => {
  assert.equal(programmeCoverOrNull("first-take"), null);
  assert.equal(
    programmeCoverOrNull("15-day-jumpstart"),
    "/brand/15-day-jumpstart-cover.png",
  );
});
