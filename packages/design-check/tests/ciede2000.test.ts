import assert from "node:assert/strict";
import { test } from "node:test";

import { deltaE00, rgbToLab, type RGB } from "../src/color/ciede2000.js";
import { parseColor } from "../src/color/parse.js";

/** ΔE00 straight from two sRGB triples. */
function rgbDistance(a: RGB, b: RGB): number {
  return deltaE00(rgbToLab(a), rgbToLab(b));
}

function rgb(hex: string): RGB {
  const parsed = parseColor(hex);
  assert.ok(parsed, `could not parse ${hex}`);
  return parsed;
}

/**
 * Sharma, Wu & Dalal's CIEDE2000 verification data. These pairs exist
 * specifically to catch the implementation mistakes that a naive port makes —
 * the hue-wrap discontinuity and the RT rotation term. Values are Lab inputs
 * with the expected ΔE00 from the published table.
 */
const SHARMA_CASES: Array<[number[], number[], number]> = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  // The hue-wrap cases: a naive atan2 implementation fails these.
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
  [[50, 2.5, 0], [50, 3.2972, 0], 1.0],
  [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0],
  [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
  // The RT rotation term dominates in the blue region.
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

test("CIEDE2000 matches the Sharma et al. verification data", () => {
  for (const [a, b, expected] of SHARMA_CASES) {
    const actual = deltaE00(a as [number, number, number], b as [number, number, number]);
    assert.ok(
      Math.abs(actual - expected) < 0.0001,
      `ΔE00(${a}, ${b}) = ${actual.toFixed(4)}, expected ${expected}`,
    );
  }
});

test("ΔE00 is zero for identical colours and symmetric", () => {
  assert.equal(rgbDistance(rgb("#f95616"), rgb("#f95616")), 0);
  assert.equal(
    rgbDistance(rgb("#e0e0e0"), rgb("#e8e8e8")).toFixed(6),
    rgbDistance(rgb("#e8e8e8"), rgb("#e0e0e0")).toFixed(6),
  );
});

/**
 * The Contentual palette. These are the numbers the thresholds in self-audit.ts
 * were chosen against, so they are assertions rather than documentation — if
 * the colour maths drifts, the rules silently change meaning.
 */
test("the Contentual palette produces the expected distances", () => {
  const pairs: Array<[string, string, number]> = [
    // Light: the two greys the check exists to catch.
    ["#e0e0e0", "#e8e8e8", 1.76], // --ds-border vs --ds-control-hover
    ["#f95616", "#ff5a1f", 1.61], // --ds-accent vs --ds-accent-hot
    // The load-bearing pair: page vs card. Sits just under the 2.3 JND, which
    // is precisely why the near-duplicate rule cannot be a blanket threshold.
    ["#ffffff", "#f5f5f5", 2.01], // --ds-bg vs --ds-surface
    ["#000000", "#111111", 2.96], // --ds-fg vs --ds-fg-soft
    // Dark.
    ["#121212", "#1e1e1e", 3.58], // --ds-bg vs --ds-surface
    ["#333333", "#2a2a2a", 2.87], // --ds-border vs --ds-control
  ];

  for (const [a, b, expected] of pairs) {
    const actual = rgbDistance(rgb(a), rgb(b));
    assert.ok(
      Math.abs(actual - expected) < 0.01,
      `ΔE00(${a}, ${b}) = ${actual.toFixed(2)}, expected ~${expected}`,
    );
  }
});

test("ΔE00 ranks this palette better than Euclidean RGB does", () => {
  // The motivating case for choosing a perceptual metric. In plain RGB,
  // fg/fg-soft (#000 vs #111) are 17 units apart while accent/accent-hot are
  // 10 — the opposite of what the eye reports. ΔE00 puts them the right way up.
  const fgPair = rgbDistance(rgb("#000000"), rgb("#111111"));
  const accentPair = rgbDistance(rgb("#f95616"), rgb("#ff5a1f"));
  assert.ok(
    accentPair < fgPair,
    `expected accent pair (${accentPair.toFixed(2)}) to read as closer than the ` +
      `near-black pair (${fgPair.toFixed(2)})`,
  );
});

test("rgbToLab places white and black at the ends of L*", () => {
  assert.ok(Math.abs(rgbToLab([255, 255, 255])[0] - 100) < 0.001);
  assert.equal(rgbToLab([0, 0, 0])[0], 0);
});
