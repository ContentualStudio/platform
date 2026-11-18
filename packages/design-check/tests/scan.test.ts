import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import ts from "typescript";

import { AllowlistMatcher, parseAllowlist } from "../src/allowlist.js";
import { ALLOWLIST, GLOBALS_CSS } from "../src/cli.js";
import { extractFromFile, looksLikeClassString, positionAt } from "../src/scan/extract-classes.js";
import { parseClassString, parseUtility } from "../src/scan/parse-utility.js";
import { scanCandidate, type ScanCounters } from "../src/scan/rules.js";
import { checkHeadingOrder } from "../src/scan/headings.js";
import { parseGlobals } from "../src/tokens/parse-globals.js";

const tokens = parseGlobals(readFileSync(GLOBALS_CSS, "utf8"), GLOBALS_CSS);
const allowlist = parseAllowlist(readFileSync(ALLOWLIST, "utf8"), ALLOWLIST);

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function scan(source: string, file = "web/src/x.tsx") {
  const counters: ScanCounters = { unanalysedColorNotations: 0 };
  const sourceFile = parse(file, source);
  const extracted = extractFromFile(sourceFile);
  const ctx = {
    tokens,
    allowlist: new AllowlistMatcher(allowlist),
    relativeFile: file,
    sourceFile,
    referencedTokens: new Set<string>(),
  };
  const findings = extracted.candidates.flatMap((c) => scanCandidate(ctx, c, counters));
  return { findings, counters, extracted };
}

// --- utility parsing ---------------------------------------------------

test("strips variants without tearing a data-attribute selector", () => {
  const u = parseUtility("data-[state=open]:hover:rounded-[13px]");
  assert.ok(u);
  // A naive split(":") would cut "data-[state=open]" in half.
  assert.deepEqual(u.variants, ["data-[state=open]", "hover"]);
  assert.equal(u.base, "rounded");
  assert.equal(u.arbitrary, "13px");
});

test("recognises compound bases", () => {
  assert.equal(parseUtility("max-w-[420px]")?.base, "max-w");
  assert.equal(parseUtility("min-h-15")?.base, "min-h");
  assert.equal(parseUtility("gap-x-4")?.base, "gap-x");
  // Without the compound list these parse as "max" and "min".
  assert.notEqual(parseUtility("max-w-[420px]")?.base, "max");
});

test("splits an opacity modifier but not a slash inside brackets", () => {
  assert.equal(parseUtility("bg-accent/50")?.modifier, "50");
  const arbitrary = parseUtility("shadow-[0_0_0_3px_rgb(0_0_0/0.12)]");
  assert.equal(arbitrary?.modifier, null);
  assert.equal(arbitrary?.arbitrary, "0_0_0_3px_rgb(0_0_0/0.12)");
});

test("handles negatives and important", () => {
  const u = parseUtility("md:!-mt-[10px]");
  assert.ok(u);
  assert.equal(u.negative, true);
  assert.equal(u.important, true);
  assert.equal(u.base, "mt");
});

test("parseClassString reports each utility's offset", () => {
  const parsed = parseClassString("flex text-[13px] gap-2");
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1]?.index, 5);
  assert.equal(parsed[1]?.utility.arbitrary, "13px");
});

// --- extraction --------------------------------------------------------

test("finds classes through cn(), ternaries and cva variant maps", () => {
  const source = `
    const button = cva("rounded-full", {
      variants: { size: { lg: "text-[19px]" } },
    });
    export function Thing({ on }: { on: boolean }) {
      return <div className={cn("p-4", on ? "text-[19px]" : "text-sm")} />;
    }
  `;
  const { findings } = scan(source);
  // Both occurrences of 19px are found: one nested three objects deep inside
  // cva's variant map, one in a ternary branch inside cn().
  assert.equal(findings.filter((f) => f.rule === "font-size").length, 2);
});

test("finds a colour in a plain object value that never touches className", () => {
  // This is the shape of planning/data.ts: a bare string in a data table.
  const source = `export const rows = [{ tint: "bg-[#e8f0fe] text-[#1a73e8]" }];`;
  const { findings } = scan(source);
  assert.equal(findings.filter((f) => f.rule === "colour-literal").length, 2);
});

test("ignores class-looking text in comments and prose", () => {
  const source = `
    // Set text-[13px] here if you want it smaller.
    /** Use rounded-[36px] for cards. */
    const help = "Choose a size between 10 and 56 pixels for your heading";
    export const A = () => <p className="text-sm">{help}</p>;
  `;
  const { findings } = scan(source);
  assert.deepEqual(findings, []);
});

test("counts template interpolations it cannot resolve", () => {
  const source = "export const A = () => <p className={`text-sm ${extra}`} />;";
  const { extracted } = scan(source);
  assert.equal(extracted.unresolvableInterpolations, 1);
});

test("checks literal inline styles but leaves computed ones alone", () => {
  const source = `
    export const A = ({ w }: { w: string }) => (
      <>
        <i style={{ background: "#e94335" }} />
        <i style={{ width: w }} />
      </>
    );
  `;
  const { findings } = scan(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.offending, "#e94335");
});

test("looksLikeClassString rejects prose and accepts utilities", () => {
  assert.equal(looksLikeClassString("flex items-center gap-2"), true);
  assert.equal(looksLikeClassString("Choose a plan that suits you"), false);
  assert.equal(looksLikeClassString("hello"), false);
});

test("positionAt resolves line and column", () => {
  const sf = parse("x.ts", "a\nbb\nccc");
  assert.deepEqual(positionAt(sf, 0), { line: 1, column: 1 });
  assert.deepEqual(positionAt(sf, 5), { line: 3, column: 1 });
});

// --- rules -------------------------------------------------------------

test("an exact scale match is reported with the token that already means it", () => {
  const { findings } = scan(`export const A = () => <p className="text-[13px]" />;`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.fix, "text-sm");
  assert.match(findings[0]!.message, /13 pixels/);
});

test("a fix keeps the utility's variants and modifiers", () => {
  const { findings } = scan(`export const A = () => <p className="md:hover:rounded-[36px]" />;`);
  assert.equal(findings[0]?.fix, "md:hover:rounded-3xl");
});

test("a colour with no near token says so instead of inventing a match", () => {
  const { findings } = scan(`export const A = () => <p className="bg-[#7b1fa2]" />;`);
  const finding = findings.find((f) => f.rule === "colour-literal");
  assert.ok(finding);
  // tint-purple is exactly this colour, so it should be proposed.
  assert.equal(finding.fix, "bg-tint-purple");

  const far = scan(`export const A = () => <p className="bg-[#7fff00]" />;`);
  const farFinding = far.findings.find((f) => f.rule === "colour-literal");
  assert.equal(farFinding?.fix, undefined);
  assert.match(farFinding!.message, /no colour in the design system is close/);
});

test("catches a utility whose token was retired — the silent failure mode", () => {
  // Tailwind emits nothing for these; the element just inherits.
  const { findings } = scan(`export const A = () => <p className="text-9xl shadow-2xl" />;`);
  const rules = findings.filter((f) => f.rule === "unknown-token").map((f) => f.offending);
  assert.deepEqual(rules.sort(), ["shadow-2xl", "text-9xl"]);
});

test("catches a var() pointing at a token that no longer exists", () => {
  const { findings } = scan(`export const A = () => <p className="text-[var(--ds-accent-hot)]" />;`);
  assert.equal(findings[0]?.rule, "dead-token-reference");
  assert.match(findings[0]!.message, /silently dropped/);
});

test("numeric leading and framework colours are classified correctly", () => {
  const { findings } = scan(`export const A = () => <p className="leading-5 text-white" />;`);
  // leading-5 derives from the spacing scale and is valid.
  assert.equal(findings.filter((f) => f.offending === "leading-5").length, 0);
  // text-white resolves, but is outside the design system — a colour problem.
  const white = findings.find((f) => f.offending === "text-white");
  assert.equal(white?.rule, "colour-literal");
});

test("padding is an error but a container width is only a warning", () => {
  const { findings } = scan(`export const A = () => <p className="p-[60px] max-w-[420px]" />;`);
  const padding = findings.find((f) => f.rule === "spacing");
  const width = findings.find((f) => f.rule === "layout-size");
  assert.equal(padding?.severity, "error");
  assert.equal(padding?.fix, "p-15");
  assert.equal(width?.severity, "warning");
});

test("the allowlist exempts a value in one file only", () => {
  const google = "web/src/components/auth/google-auth-button.tsx";
  const exempt = scan(`export const A = () => <svg fill="#4285F4" />;`, google);
  assert.deepEqual(exempt.findings, []);

  const elsewhere = scan(`export const A = () => <svg fill="#4285F4" />;`, "web/src/other.tsx");
  assert.equal(elsewhere.findings.length, 1);
});

test("unsupported colour notations are counted, not silently skipped", () => {
  const { findings, counters } = scan(
    `export const A = () => <p className="bg-[oklch(0.7_0.1_20)]" />;`,
  );
  assert.equal(counters.unanalysedColorNotations, 1);
  assert.equal(findings.filter((f) => f.rule === "colour-literal").length, 0);
});

// --- headings ----------------------------------------------------------

const heading = (src: string) => checkHeadingOrder(parse("x.tsx", src), "x.tsx");

test("catches a skipped heading level", () => {
  const findings = heading(`
    export function Page() {
      return <div><h2>A</h2><h4>B</h4></div>;
    }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.expected, "<h3>");
});

test("catches two real top-level headings", () => {
  const findings = heading(`
    export function Page() {
      return <div><h1>A</h1><h1>B</h1></div>;
    }
  `);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /2 top-level headings/);
});

test("does NOT flag one heading per branch of a conditional", () => {
  // Only one of these ever renders. This is the shape of dashboard-header.tsx,
  // and treating it as two headings is the obvious wrong answer.
  const findings = heading(`
    export function Header({ title }: { title?: string }) {
      return <div>{title ? <h1>{title}</h1> : <><h1>Hello</h1></>}</div>;
    }
  `);
  assert.deepEqual(findings, []);
});

test("scopes the outline to one component, not the whole file", () => {
  const findings = heading(`
    export function A() { return <h1>A</h1>; }
    export function B() { return <h1>B</h1>; }
  `);
  assert.deepEqual(findings, []);
});

test("understands role=heading with aria-level", () => {
  const findings = heading(`
    export function Page() {
      return <div><div role="heading" aria-level={2}>A</div><h5>B</h5></div>;
    }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.expected, "<h3>");
});
