import { errorCount, warningCount, type Finding, type RunResult } from "./findings.js";

/**
 * Terminal output. Engineering-facing — the designer-facing view is the HTML
 * report, which is generated from the same findings.
 */

const colour = process.stdout.isTTY && !process.env.NO_COLOR;

const dim = (s: string): string => (colour ? `[2m${s}[0m` : s);
const red = (s: string): string => (colour ? `[31m${s}[0m` : s);
const yellow = (s: string): string => (colour ? `[33m${s}[0m` : s);
const bold = (s: string): string => (colour ? `[1m${s}[0m` : s);

function location(finding: Finding): string {
  if (!finding.file) return finding.screen ?? "";
  const parts = [finding.file];
  if (finding.line) parts.push(String(finding.line));
  if (finding.column) parts.push(String(finding.column));
  return parts.join(":");
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join(`\n${indent}`);
}

function renderFinding(finding: Finding): string {
  const mark = finding.severity === "error" ? red("✗") : yellow("⚠");
  const head = `  ${mark} ${location(finding)}  ${dim(finding.rule)}`;
  const body = `      ${wrap(finding.message, 78, "      ")}`;
  const fix = finding.expected
    ? `\n      ${dim("→")} ${finding.offending} ${dim("should be")} ${finding.expected}`
    : "";
  return `${head}\n${body}${fix}`;
}

export function renderReport(result: RunResult, target: string): string {
  const { findings, stats } = result;
  const lines: string[] = [];

  lines.push("");
  lines.push(bold(`design:check — ${target}`));
  lines.push("");

  if (findings.length === 0) {
    lines.push(`  No design defects found across ${stats.filesScanned} files.`);
  }

  const system = findings.filter((f) => f.rule.startsWith("S"));
  const callSites = findings.filter((f) => !f.rule.startsWith("S"));

  if (system.length > 0) {
    lines.push(bold("  THE DESIGN SYSTEM ITSELF"), "");
    lines.push(...system.map(renderFinding), "");
  }

  if (callSites.length > 0) {
    lines.push(bold("  CALL SITES"), "");
    lines.push(...callSites.map(renderFinding), "");
  }

  const errors = errorCount(findings);
  const warnings = warningCount(findings);
  const summary = [
    `${errors} error${errors === 1 ? "" : "s"}`,
    `${warnings} warning${warnings === 1 ? "" : "s"}`,
    `${stats.filesScanned} file${stats.filesScanned === 1 ? "" : "s"}`,
  ];
  lines.push(`  ${summary.join(" · ")}`);

  // These two counters exist so gaps in coverage are visible rather than
  // being mistaken for a clean result.
  if (stats.unresolvableInterpolations > 0) {
    lines.push(
      dim(
        `  ${stats.unresolvableInterpolations} class string(s) built dynamically could not be checked.`,
      ),
    );
  }
  if (stats.unanalysedColorNotations > 0) {
    lines.push(
      dim(
        `  ${stats.unanalysedColorNotations} colour(s) use a notation this check does not analyse (oklch/color-mix).`,
      ),
    );
  }
  lines.push("");

  return lines.join("\n");
}
