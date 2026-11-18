import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  AllowlistError,
  AllowlistMatcher,
  parseAllowlist,
  type ColorRelations,
} from "../src/allowlist.js";
import { ALLOWLIST, GLOBALS_CSS } from "../src/cli.js";
import { parseGlobals } from "../src/tokens/parse-globals.js";
import { auditDesignSystem, suggestedDsName } from "../src/tokens/self-audit.js";

/**
 * The audit runs against a frozen copy of globals.css as it stood before the
 * token work, not against the live file. That is deliberate: these assertions
 * describe defects the check must be able to find, and they would silently
 * evaporate into vacuous passes the moment the real file was fixed.
 *
 * The live file is covered separately, at the bottom, by asserting it is clean.
 */
const FIXTURE = path.join(import.meta.dirname, "fixtures/globals-before.css");
const css = readFileSync(FIXTURE, "utf8");
const tokens = parseGlobals(css, FIXTURE);
const allowlist = parseAllowlist(readFileSync(ALLOWLIST, "utf8"), ALLOWLIST);

/* The pre-fix file is judged with no declared relations, which is the state
   the allowlist was in when these defects were first found. */
const BARE: ColorRelations = { aliases: [], adjacent: [], themeInvariant: [] };
const findings = auditDesignSystem(tokens, css, BARE);

const has = (rule: string, needle: string): boolean =>
  findings.some((f) => f.rule === rule && (f.message + f.offending).includes(needle));

/**
 * Acceptance fixtures. Each of these is a defect identified by reading
 * globals.css by hand, so they pin the check to real findings rather than to
 * whatever it happens to emit.
 */
test("catches the muted / muted-foreground collision", () => {
  assert.ok(has("S2", "--ds-muted"));
});

test("catches radius tokens hardcoded as literals", () => {
  assert.ok(has("S1", "--radius-sm"));
  assert.ok(has("S1", "--radius-xl"));
});

test("catches the --radius-xl / --ds-radius-xl name collision", () => {
  assert.ok(has("S3", "--ds-radius-xl"));
});

test("catches the fractional radius", () => {
  assert.ok(has("S4", "28.75px"));
});

test("catches the off-lattice spacing token", () => {
  assert.ok(has("S4", "--ds-space-14"));
});

test("catches the identical greys", () => {
  // Light: --ds-surface and --ds-control are both #f5f5f5.
  assert.ok(has("S6a", "--ds-control"));
  // Dark: --ds-border and --ds-control-hover are both #333333.
  assert.ok(
    findings.some(
      (f) => f.rule === "S6a" && f.message.includes("dark") && f.message.includes("#333333"),
    ),
  );
});

test("catches the near-duplicate greys and oranges", () => {
  assert.ok(has("S6b", "--ds-border"), "border vs control-hover at ΔE00 1.76");
  assert.ok(has("S6b", "--ds-accent-hot"), "accent vs accent-hot at ΔE00 1.61");
});

test("catches identical surfaces that are declared adjacent", () => {
  // --ds-surface / --ds-surface-raised are declared as an adjacent pair, so
  // the near-duplicate rule exempts them — S6c has to catch them instead.
  assert.ok(
    findings.some(
      (f) =>
        (f.rule === "S6a" || f.rule === "S6c") &&
        f.message.includes("dark") &&
        f.message.includes("--ds-surface-raised"),
    ),
  );
});

test("does NOT flag semantic aliases onto one palette token", () => {
  // --color-foreground, --color-primary and --color-card-foreground all point
  // at --ds-fg. That is what an alias layer is for, not drift.
  const aliasNoise = findings.filter(
    (f) => f.rule === "S2" && f.message.includes("--color-primary"),
  );
  assert.equal(aliasNoise.length, 0);
});

test("catches hardcoded colours outside the token blocks", () => {
  // The accent is restated as a raw rgb() in three places: --shadow-focus-accent
  // in @theme inline, ::selection in @layer base, and .contentual-input:focus in
  // @layer components. All three are S1 — the last two matter most, because a
  // regex that only swept custom properties would miss them entirely.
  const accentLiterals = findings.filter(
    (f) => f.rule === "S1" && f.offending.includes("249 86 22"),
  );
  assert.equal(accentLiterals.length, 3);

  const inRules = accentLiterals.filter((f) => f.message.startsWith('"'));
  assert.deepEqual(
    inRules.map((f) => f.line).sort((a, b) => (a ?? 0) - (b ?? 0)),
    [149, 280],
    "::selection and .contentual-input:focus",
  );
});

test("reports dead tokens as warnings, not errors", () => {
  const dead = findings.filter((f) => f.rule === "S5");
  assert.ok(dead.length > 0);
  assert.ok(dead.every((f) => f.severity === "warning"));
  assert.ok(dead.some((f) => f.offending === "--ds-space-14"));
  assert.ok(dead.some((f) => f.offending === "--ds-muted-strong"));
});

test("every finding carries a location and a plain-English message", () => {
  for (const finding of findings) {
    assert.ok(finding.line && finding.line > 0, `${finding.rule} has no line`);
    assert.ok(finding.file, `${finding.rule} has no file`);
    assert.ok(
      finding.message.length > 40,
      `${finding.rule} message is too terse to be useful: ${finding.message}`,
    );
    // Designer-facing text must not lead with a rule id.
    assert.ok(!/^S\d/.test(finding.message), `${finding.rule} message starts with a rule id`);
  }
});

test("suggests the right --ds-* name per namespace", () => {
  assert.equal(suggestedDsName("--color-accent"), "var(--ds-accent)");
  assert.equal(suggestedDsName("--radius-sm"), "var(--ds-radius-sm)");
  assert.equal(suggestedDsName("--shadow-soft"), "var(--ds-shadow-soft)");
});

// --- allowlist ---------------------------------------------------------

test("the committed allowlist is valid", () => {
  assert.ok(Array.isArray(allowlist.exceptions));
  assert.ok(allowlist.colorRelations.adjacent.length > 0);
});

test("an exception without a real reason is rejected", () => {
  const json = JSON.stringify({
    exceptions: [{ file: "a.tsx", rule: "colour-literal", values: ["#fff"], reason: "brand" }],
  });
  assert.throws(() => parseAllowlist(json, "test"), AllowlistError);
});

test("an exception missing required fields is rejected", () => {
  const json = JSON.stringify({ exceptions: [{ file: "a.tsx", rule: "colour-literal" }] });
  assert.throws(() => parseAllowlist(json, "test"), AllowlistError);
});

test("stale allowlist entries are reported so they cannot accumulate", () => {
  const matcher = new AllowlistMatcher({
    colorRelations: { aliases: [], adjacent: [], themeInvariant: [] },
    exceptions: [
      {
        file: "used.tsx",
        rule: "colour-literal",
        values: ["#4285F4"],
        reason: "Google brand mark, recolouring is forbidden by their guidelines.",
      },
      {
        file: "gone.tsx",
        rule: "colour-literal",
        values: ["#abcdef"],
        reason: "This exception refers to code that no longer exists anywhere.",
      },
    ],
  });

  assert.equal(matcher.allows("web/src/used.tsx", "colour-literal", "#4285F4"), true);
  assert.equal(matcher.allows("web/src/used.tsx", "colour-literal", "#000000"), false);

  const stale = matcher.stale();
  assert.equal(stale.length, 1);
  assert.equal(stale[0]?.file, "gone.tsx");
});

test("declared relations are what suppress page-vs-card, not a weak rule", () => {
  // Undeclared, --ds-bg vs --ds-surface IS reported at ΔE00 2.01.
  assert.ok(
    findings.some((f) => f.rule === "S6b" && f.message.includes("--ds-bg (#ffffff)")),
  );

  // Declared adjacent, it is not — and that declaration is a reviewable line
  // in a committed file rather than a threshold quietly tuned until it passed.
  const declared = auditDesignSystem(tokens, css, allowlist.colorRelations);
  assert.ok(
    !declared.some((f) => f.rule === "S6b" && f.message.includes("--ds-bg (#ffffff)")),
  );
});

test("the live globals.css is clean", () => {
  const liveCss = readFileSync(GLOBALS_CSS, "utf8");
  const live = auditDesignSystem(
    parseGlobals(liveCss, GLOBALS_CSS),
    liveCss,
    allowlist.colorRelations,
  );
  const errors = live.filter((f) => f.severity === "error");
  assert.deepEqual(
    errors.map((f) => `${f.rule} ${f.offending}`),
    [],
    "the shipped design system must satisfy its own rules",
  );
});
