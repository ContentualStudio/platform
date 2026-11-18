import ts from "typescript";

import { CSS_COLOR_RE } from "../color/parse.js";

/**
 * Pulls every checkable string out of a .ts/.tsx file, with exact positions.
 *
 * The TypeScript compiler API rather than a regex, and the reason is narrower
 * than "regexes are bad" — a regex over the raw text would in fact catch most
 * of the arbitrary values here, because a Tailwind class is lexically
 * distinctive. What it cannot do is:
 *
 *   1. report a position *inside* a template-literal span,
 *   2. tell a class string from the same characters in a comment or docstring,
 *   3. recurse into cva()'s nested variant objects and keep provenance,
 *   4. support the heading-order check at all.
 *
 * This uses `ts.createSourceFile` only — no Program, no type checker, no
 * tsconfig resolution — so it runs over ~190 files in well under a second.
 */

export type Origin =
  | "className"
  | "cva"
  | "class-like-string"
  | "inline-style"
  | "jsx-prop";

export interface ClassCandidate {
  file: string;
  /** Absolute offset of the string body (past the opening quote). */
  offset: number;
  text: string;
  origin: Origin;
}

export interface ExtractResult {
  candidates: ClassCandidate[];
  /**
   * Template literals with interpolations we could not resolve. Counted and
   * reported rather than ignored, so the coverage gap stays visible instead of
   * being mistaken for a clean result.
   */
  unresolvableInterpolations: number;
}

/** Helpers whose string arguments are class lists. */
const CLASS_HELPERS = new Set(["cn", "clsx", "cva", "cx", "twMerge", "twJoin"]);

/** JSX props that carry a colour or a class list but are not `className`. */
const COLOUR_PROPS = new Set(["color", "fill", "stroke", "stopColor", "backgroundColor"]);

const UTILITY_PREFIXES = [
  "text", "bg", "border", "rounded", "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml", "gap", "flex", "grid", "w", "h",
  "size", "min", "max", "font", "leading", "tracking", "shadow", "ring",
  "opacity", "z", "absolute", "relative", "fixed", "sticky", "block", "inline",
  "hidden", "items", "justify", "self", "order", "col", "row", "space",
  "overflow", "cursor", "transition", "duration", "ease", "animate", "scale",
  "rotate", "translate", "outline", "select", "pointer", "whitespace", "truncate",
];

const CLASS_TOKEN_RE =
  /^(?:[\w[\]&>.#:=~^$*|-]+:)*!?-?[a-z][a-z0-9-]*(?:-\[[^\]]*\])?(?:\/[\w.]+)?$/;

/** True when a bare string reads as a Tailwind class list rather than prose. */
export function looksLikeClassString(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  if (!tokens.every((t) => CLASS_TOKEN_RE.test(t))) return false;

  return tokens.some((token) => {
    const base = token.split(":").pop() ?? token;
    const head = base.replace(/^!?-/, "").split("-")[0] ?? "";
    return UTILITY_PREFIXES.includes(head);
  });
}

export function extractFromFile(sf: ts.SourceFile): ExtractResult {
  const file = sf.fileName;
  const candidates: ClassCandidate[] = [];
  const seen = new Set<number>();
  let unresolvableInterpolations = 0;

  const record = (node: ts.Node, origin: Origin): void => {
    const offset = node.getStart(sf) + 1;
    if (seen.has(offset)) return;
    seen.add(offset);
    candidates.push({ file, offset, text: (node as ts.StringLiteral).text, origin });
  };

  /** Walks an expression that evaluates to a class string. */
  const collect = (node: ts.Node | undefined, origin: Origin): void => {
    if (!node) return;

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      record(node, origin);
      return;
    }

    if (ts.isTemplateExpression(node)) {
      // Only the static spans can be checked; each interpolation is opaque.
      unresolvableInterpolations += node.templateSpans.length;
      if (node.head.text.trim()) record(node.head, origin);
      for (const span of node.templateSpans) {
        if (span.literal.text.trim()) record(span.literal, origin);
      }
      return;
    }

    if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue, origin);
      collect(node.whenFalse, origin);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      collect(node.left, origin);
      collect(node.right, origin);
      return;
    }
    if (ts.isParenthesizedExpression(node)) {
      collect(node.expression, origin);
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) collect(element, origin);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      // cva variant maps: { size: { lg: "min-h-15 rounded-xl" } }
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop)) collect(prop.initializer, origin);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CLASS_HELPERS.has(node.expression.text)
    ) {
      const helperOrigin = node.expression.text === "cva" ? "cva" : origin;
      for (const arg of node.arguments) collect(arg, helperOrigin);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      const init = node.initializer;
      const value =
        init && ts.isJsxExpression(init) ? init.expression : (init as ts.Node | undefined);

      if (name === "className" || name === "class") {
        collect(value, "className");
      } else if (COLOUR_PROPS.has(name)) {
        // e.g. <NextTopLoader color="#f95616" />
        if (value && ts.isStringLiteral(value)) record(value, "jsx-prop");
      } else if (name === "style" && value && ts.isObjectLiteralExpression(value)) {
        for (const prop of value.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          // Only literal values are checkable. A computed width or a
          // data-driven gradient is legitimately dynamic and is left alone.
          if (ts.isStringLiteral(prop.initializer)) record(prop.initializer, "inline-style");
        }
      }
    }

    // A top-level cva(...) call is reached here even when it is not inside JSX.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "cva"
    ) {
      for (const arg of node.arguments) collect(arg, "cva");
    }

    /*
     * Any string literal anywhere that reads as a class list or contains a CSS
     * colour. This is what reaches the category palette in planning/data.ts,
     * whose `tint:` fields are plain object values and never touch a className
     * attribute in the file that declares them.
     *
     * Folded into the same walk rather than a second pass over the tree —
     * `record` already de-duplicates by offset, so a literal reached both ways
     * keeps whichever origin was seen first.
     */
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (looksLikeClassString(node.text) || CSS_COLOR_RE.test(node.text)) {
        record(node, "class-like-string");
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { candidates, unresolvableInterpolations };
}

/**
 * Converts an absolute offset into a 1-indexed line and column.
 *
 * Uses the SourceFile's cached line-start table rather than rescanning the text
 * from the beginning for every finding.
 */
export function positionAt(
  sf: ts.SourceFile,
  offset: number,
): { line: number; column: number } {
  const { line, character } = sf.getLineAndCharacterOfPosition(offset);
  return { line: line + 1, column: character + 1 };
}
