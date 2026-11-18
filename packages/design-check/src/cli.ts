import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AllowlistError, AllowlistMatcher, loadAllowlist } from "./allowlist.js";
import { applyFixes } from "./fix.js";
import { renderReport } from "./report/console.js";
import { renderHtml, type VisualData } from "./report/html.js";
import { nextId, errorCount, type Finding, type RunResult } from "./report/findings.js";
import { extractFromFile } from "./scan/extract-classes.js";
import { checkHeadingOrder } from "./scan/headings.js";
import { scanCandidate, type ScanCounters } from "./scan/rules.js";
import { findSourceFiles } from "./scan/source-files.js";
import { parseGlobals } from "./tokens/parse-globals.js";
import { auditDesignSystem } from "./tokens/self-audit.js";

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

export const GLOBALS_CSS = path.join(REPO_ROOT, "web/src/app/globals.css");
export const WEB_SRC = path.join(REPO_ROOT, "web/src");
export const ALLOWLIST = path.join(PACKAGE_ROOT, "design-allowlist.json");
export const OUTPUT_DIR = path.join(REPO_ROOT, "output/design-check");

interface Options {
  only: Set<string>;
  json: boolean;
  html: boolean;
  fix: boolean;
}

function parseArgs(argv: string[]): Options {
  const only = new Set<string>();
  let json = false;
  let html = false;
  let fix = false;

  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--html") html = true;
    else if (arg === "--fix") fix = true;
    else if (arg.startsWith("--only=")) {
      for (const part of arg.slice("--only=".length).split(",")) {
        if (part.trim()) only.add(part.trim());
      }
    }
  }
  return { only, json, html, fix };
}

export function runStaticCheck(options: Options): RunResult {
  const allowlist = loadAllowlist(ALLOWLIST);
  const matcher = new AllowlistMatcher(allowlist);
  const findings: Finding[] = [];
  const counters: ScanCounters = { unanalysedColorNotations: 0 };

  let filesScanned = 0;
  let unresolvableInterpolations = 0;

  const wants = (pass: string): boolean =>
    options.only.size === 0 || options.only.has(pass);

  const css = readFileSync(GLOBALS_CSS, "utf8");
  const tokens = parseGlobals(css, GLOBALS_CSS);

  // --ds-* names reached from web/src, so the dead-token rule does not tell
  // you to delete a token the call sites are using.
  const referencedTokens = new Set<string>();
  const callSiteFindings: Finding[] = [];

  if (wants("call-sites") || wants("headings")) {
    for (const file of findSourceFiles(WEB_SRC)) {
      const source = readFileSync(file, "utf8");
      const relativeFile = path.relative(REPO_ROOT, file);
      filesScanned += 1;

      // One parse per file, shared by both passes. Parsing twice was a quarter
      // of the analysis time, spent building a byte-identical second AST.
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      if (wants("call-sites")) {
        const extracted = extractFromFile(sourceFile);
        unresolvableInterpolations += extracted.unresolvableInterpolations;

        const ctx = { tokens, allowlist: matcher, relativeFile, sourceFile, referencedTokens };
        for (const candidate of extracted.candidates) {
          callSiteFindings.push(...scanCandidate(ctx, candidate, counters));
        }
      }

      if (wants("headings")) {
        callSiteFindings.push(...checkHeadingOrder(sourceFile, relativeFile));
      }
    }
  }

  // Runs after the call-site walk so the dead-token rule can see its results.
  if (wants("system")) {
    findings.push(
      ...auditDesignSystem(tokens, css, allowlist.colorRelations, referencedTokens),
    );
    filesScanned += 1;
  }
  findings.push(...callSiteFindings);

  /*
   * A dead exception is an error, not a warning: an allowlist that is never
   * pruned is a baseline file wearing a different name.
   *
   * Only checked when the call-site pass actually ran, though. Exceptions are
   * matched by the call-site rules, so `--only=system` would otherwise report
   * every entry as dead and demand you delete a perfectly good allowlist.
   */
  const staleEntries = wants("call-sites") ? matcher.stale() : [];
  for (const entry of staleEntries) {
    findings.push({
      id: nextId("allowlist"),
      source: "static",
      severity: "error",
      rule: "stale-allowlist",
      ruleTitle: "An exception no longer applies",
      message:
        `The allowlist still exempts ${entry.values.join(", ")} in ${entry.file}, but ` +
        `nothing there matches any more. Delete the entry so the list keeps describing ` +
        `the code as it actually is.`,
      offending: entry.values.join(", "),
      file: "packages/design-check/design-allowlist.json",
    });
  }

  return {
    findings: sortFindings(findings),
    stats: {
      filesScanned,
      unresolvableInterpolations,
      unanalysedColorNotations: counters.unanalysedColorNotations,
    },
  };
}

/**
 * Writes the designer-facing report.
 *
 * If the visual pass has not been run, the report says so in the screens
 * section rather than rendering an empty one — a report that looks complete
 * but only covers half the ground is worse than no report.
 */
function writeHtmlReport(result: RunResult): void {
  const visualPath = path.join(OUTPUT_DIR, "visual-records.json");
  let visual: VisualData | null = null;

  if (existsSync(visualPath)) {
    visual = JSON.parse(readFileSync(visualPath, "utf8")) as VisualData;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const indexPath = path.join(OUTPUT_DIR, "index.html");
  writeFileSync(indexPath, renderHtml(result, visual, generatedAt));
  writeFileSync(
    path.join(OUTPUT_DIR, "findings.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  process.stdout.write(
    `\n  Report written to ${indexPath}\n` +
      (visual
        ? `  Includes ${new Set(visual.records.map((r) => r.screen)).size} screen(s) from the visual pass.\n`
        : `  The visual pass has not been run, so the report covers the design system and\n` +
          `  the code only. Run "yarn design:visual" first to include the screens.\n`),
  );
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0),
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  let result: RunResult;
  try {
    result = runStaticCheck(options);
  } catch (error) {
    if (error instanceof AllowlistError) {
      process.stderr.write(`\ndesign:check — allowlist is invalid\n\n  ${error.message}\n\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (options.fix) {
    const applied = applyFixes(result.findings, REPO_ROOT);
    process.stdout.write(
      `\ndesign:check --fix\n\n` +
        `  ${applied.replacements} replacement(s) across ${applied.filesChanged} file(s).\n` +
        `  ${applied.skipped} finding(s) need a person and were left alone.\n\n` +
        `  Re-run design:check to see what remains.\n\n`,
    );
    return;
  }

  if (options.html) {
    writeHtmlReport(result);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const target = options.only.size > 0 ? [...options.only].join(", ") : "web/src";
    process.stdout.write(renderReport(result, target));
  }

  // Set exitCode rather than calling process.exit(): when stdout is a pipe,
  // writes are asynchronous and process.exit() truncates them mid-stream.
  const enforcing = process.env.DESIGN_CHECK_ENFORCE !== "0";
  process.exitCode = enforcing && errorCount(result.findings) > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
