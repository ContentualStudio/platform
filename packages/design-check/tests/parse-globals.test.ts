import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { GLOBALS_CSS } from "../src/cli.js";
import {
  fluidMaxPx,
  fluidMinPx,
  parseGlobals,
  referencedDsVars,
  refOf,
} from "../src/tokens/parse-globals.js";
import { nearestFontSize, nearestScalar, toPx } from "../src/tokens/token-set.js";

/**
 * Parsed against the frozen pre-token-work copy of globals.css. These tests
 * are about the parser's behaviour on a hostile input — multi-line quoted
 * values, five keyframe blocks, a component layer — and that input should not
 * change under them every time the design system is edited. The live file gets
 * its own assertions below.
 */
const FIXTURE = path.join(import.meta.dirname, "fixtures/globals-before.css");
const css = readFileSync(FIXTURE, "utf8");
const tokens = parseGlobals(css, FIXTURE);
const live = parseGlobals(readFileSync(GLOBALS_CSS, "utf8"), GLOBALS_CSS);

test("reads --ds-* tokens from :root", () => {
  assert.equal(tokens.ds.light.get("--ds-accent")?.value, "#f95616");
  assert.equal(tokens.ds.light.get("--ds-surface")?.value, "#f5f5f5");
  assert.equal(tokens.ds.light.get("--ds-radius-lg")?.value, "28.75px");
});

test("dark inherits light where it does not override", () => {
  // Overridden.
  assert.equal(tokens.ds.dark.get("--ds-bg")?.value, "#121212");
  // Not present in the dark block at all — must fall back, not vanish.
  assert.equal(
    tokens.ds.dark.get("--ds-radius-md")?.value,
    tokens.ds.light.get("--ds-radius-md")?.value,
  );
});

test("collapses the multi-line font stack rather than truncating it", () => {
  const font = tokens.ds.light.get("--font-metropolis")?.value ?? "";
  // The value spans four source lines and contains quoted commas — the exact
  // shape a flat regex mangles.
  assert.match(font, /^"Metropolis", -apple-system/);
  assert.match(font, /sans-serif$/);
  assert.ok(!font.includes("\n"));
});

test("does not mistake keyframe or component declarations for tokens", () => {
  // @keyframes planning-pulse sets `opacity: 0.4`; .contentual-button sets
  // `min-height: 48px`. Neither is a token.
  for (const [name] of tokens.ds.light) {
    assert.ok(name.startsWith("--"), `${name} is not a custom property`);
  }
  assert.equal(tokens.ds.light.has("opacity"), false);
  assert.equal(tokens.ds.light.has("min-height"), false);

  // But they must still be visible to the hardcoded-literal audit.
  const props = tokens.otherDecls.map((d) => d.prop);
  assert.ok(props.includes("min-height"));
  assert.ok(props.includes("opacity"));
});

test("resolves @theme inline through one level of var() indirection", () => {
  const accent = tokens.colors.find((c) => c.name === "accent");
  assert.ok(accent);
  assert.equal(accent.ref, "--ds-accent");
  assert.deepEqual([...accent.light], [249, 86, 22]);
  // Dark mode restates the same accent, so both themes resolve identically.
  assert.deepEqual([...accent.dark], [249, 86, 22]);
});

test("records literal @theme values without dropping them from the legal set", () => {
  // --radius-sm: 6px is a defect (S1 reports it), but it must still be legal
  // at call sites — otherwise one token bug cascades into hundreds of
  // phantom call-site errors.
  const sm = tokens.radii.find((r) => r.name === "sm");
  assert.ok(sm);
  assert.equal(sm.px, 6);
  assert.equal(sm.ref, null);
});

test("captures the state the design system started in", () => {
  // No type scale was declared at all — the gap the token work closes.
  assert.equal(tokens.fontSizes.length, 0);
  // --ds-space-* was never mapped, so spacing resolved through Tailwind's default.
  assert.equal(tokens.spacingBasePx, 4);
  // Four shadows, all hardcoded rather than token-backed.
  assert.equal(tokens.shadows.length, 4);
});

test("reads the type scale the token work introduced", () => {
  const byName = new Map(live.fontSizes.map((t) => [t.name, t]));
  assert.equal(byName.get("sm")?.px, 13, "text-sm is the design's 13px, not Tailwind's 14px");
  assert.equal(byName.get("base")?.px, 15);
  assert.equal(byName.get("3xl")?.px, 28);
  assert.equal(byName.get("6xl")?.px, 56);

  // Modifiers attach to their size rather than being parsed as separate tokens.
  assert.equal(byName.get("sm")?.lineHeight, "1.5");
  assert.equal(byName.get("6xl")?.letterSpacing, "-0.03em");
  assert.ok(!byName.has("sm--line-height"), "modifiers must not become sizes");

  // Fluid tokens are marked, and their endpoints are rungs on the fixed ladder.
  const fluid = byName.get("fluid-lg");
  assert.ok(fluid?.fluid);
  assert.equal(fluid?.px, 56);
  assert.equal(fluidMinPx(fluid!.raw), 32);
});

test("the radius ladder is ordered and fully token-backed", () => {
  const rungs = live.radii.filter((r) => r.name !== "full" && r.name !== "none");
  assert.deepEqual(
    rungs.map((r) => r.px),
    [2, 6, 10, 13, 20, 28, 36, 40],
  );
  assert.ok(rungs.every((r) => r.ref !== null), "every rung points at a --ds-* token");
});

test("the --ds-space-* block is gone from the live file", () => {
  const spaceTokens = [...live.ds.light.keys()].filter((k) => k.startsWith("--ds-space-"));
  assert.deepEqual(spaceTokens, [], "spacing is Tailwind's --spacing scale alone");
  assert.equal(live.spacingBasePx, 4);
});

test("refOf recognises only a bare var() reference", () => {
  assert.equal(refOf("var(--ds-accent)"), "--ds-accent");
  assert.equal(refOf("  var( --ds-bg ) "), "--ds-bg");
  assert.equal(refOf("#f95616"), null);
  assert.equal(refOf("0 0 0 3px rgb(249 86 22 / 0.12)"), null);
});

test("referencedDsVars finds every var() use", () => {
  const used = referencedDsVars(css);
  assert.ok(used.has("--ds-accent"));
  assert.ok(used.has("--ds-space-2"), "used by .contentual-button");
  assert.ok(!used.has("--ds-space-14"), "declared but referenced nowhere");
  assert.ok(!used.has("--ds-muted-strong"), "declared but referenced nowhere");
});

test("toPx converts fixed lengths and rejects everything else", () => {
  assert.equal(toPx("13px"), 13);
  assert.equal(toPx("0.8125rem"), 13);
  assert.equal(toPx("28.75px"), 28.75);
  assert.equal(toPx("9999px"), 9999);
  assert.equal(toPx("clamp(1rem, 2vw, 3rem)"), null);
  assert.equal(toPx("50%"), null);
  assert.equal(toPx("auto"), null);
});

test("fluid token endpoints resolve to px", () => {
  assert.equal(fluidMinPx("clamp(3rem, 7vw, 4.5rem)"), 48);
  assert.equal(fluidMaxPx("clamp(3rem, 7vw, 4.5rem)"), 72);
  assert.equal(fluidMaxPx("1.5rem"), null);
});

test("nearest-token lookup picks the closest rung", () => {
  const scale = [
    { name: "md", px: 13, ref: null, line: 0 },
    { name: "lg", px: 20, ref: null, line: 0 },
    { name: "xl", px: 28, ref: null, line: 0 },
  ];
  assert.equal(nearestScalar(22, scale)?.name, "lg");
  assert.equal(nearestScalar(27, scale)?.name, "xl");

  const sizes = [
    { name: "sm", px: 13, raw: "13px", fluid: false, line: 0 },
    { name: "base", px: 15, raw: "15px", fluid: false, line: 0 },
    { name: "fluid-lg", px: 56, raw: "clamp(2rem,5vw,3.5rem)", fluid: true, line: 0 },
  ];
  assert.equal(nearestFontSize(14, sizes)?.name, "sm");
  // A fluid token is never proposed as the fix for a fixed size.
  assert.equal(nearestFontSize(60, sizes)?.name, "base");
});
