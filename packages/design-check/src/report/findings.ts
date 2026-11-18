/**
 * The single finding shape both passes emit.
 *
 * The static check and the Playwright visual check produce structurally
 * identical records so the report can merge them without a translation layer.
 * `message` is the designer-facing sentence and must read as plain English —
 * no rule ids, no utility syntax without a gloss.
 */

export type Severity = "error" | "warning" | "advisory";
export type Source = "static" | "visual";

export interface Finding {
  /** Stable within a run; used to key crops and to de-duplicate on merge. */
  id: string;
  source: Source;
  severity: Severity;
  /** Machine id, e.g. "S6b" or "font-size". Never shown to designers alone. */
  rule: string;
  /** Human-readable rule name, e.g. "Two colours are visually identical". */
  ruleTitle: string;
  /** Plain-English explanation of what is wrong. */
  message: string;
  /** The value at fault, as written: "#e8f0fe", "text-[13px]", "28.75px". */
  offending: string;
  /** The correct value, in both human and token form, when one exists. */
  expected?: string;
  /**
   * The exact replacement text for `offending`, when the fix is unambiguous.
   * `--fix` applies only these, so anything needing judgement is left alone
   * rather than guessed at.
   */
  fix?: string;
  /** Repo-relative path. */
  file?: string;
  line?: number;
  column?: number;
  /** Visual findings only. */
  screen?: string;
  viewport?: string;
  theme?: "light" | "dark";
  /** Annotated cut-out, embedded in the HTML report. */
  cropDataUri?: string;
}

export interface RunStats {
  filesScanned: number;
  /** Class strings we could not resolve (dynamic template interpolation). */
  unresolvableInterpolations: number;
  /** Colour notations we recognised but cannot convert (oklch, color-mix). */
  unanalysedColorNotations: number;
}

export interface RunResult {
  findings: Finding[];
  stats: RunStats;
}

export function errorCount(findings: Finding[]): number {
  return findings.filter((f) => f.severity === "error").length;
}

export function warningCount(findings: Finding[]): number {
  return findings.filter((f) => f.severity === "warning").length;
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
