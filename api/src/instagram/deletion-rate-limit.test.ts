import * as assert from "node:assert/strict";
import { test } from "node:test";
import { FixedWindowLimiter } from "./deletion-rate-limit";

test("callers are allowed up to the limit and refused after it", () => {
  const limiter = new FixedWindowLimiter(3, 60_000);

  assert.equal(limiter.tryConsume("a", 0), true);
  assert.equal(limiter.tryConsume("a", 0), true);
  assert.equal(limiter.tryConsume("a", 0), true);
  assert.equal(limiter.tryConsume("a", 0), false);
});

test("the window reopens once it has passed", () => {
  const limiter = new FixedWindowLimiter(1, 60_000);

  assert.equal(limiter.tryConsume("a", 0), true);
  assert.equal(limiter.tryConsume("a", 59_999), false);
  assert.equal(limiter.tryConsume("a", 60_000), true);
});

test("callers are counted separately", () => {
  const limiter = new FixedWindowLimiter(1, 60_000);

  assert.equal(limiter.tryConsume("a", 0), true);
  assert.equal(limiter.tryConsume("b", 0), true);
});

// The map is keyed on caller-controlled input, so it must not grow forever.
test("expired entries are swept rather than accumulating", () => {
  const limiter = new FixedWindowLimiter(1, 10);

  for (let index = 0; index < 1_500; index += 1) {
    limiter.tryConsume(`caller-${index}`, index);
  }

  const size = (limiter as unknown as { hits: Map<string, unknown> }).hits.size;

  assert.ok(size < 1_500, `expected a swept map, saw ${size} entries`);
});
