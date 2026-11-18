import ts from "typescript";

import { nextId, type Finding } from "../report/findings.js";
import { positionAt } from "./extract-classes.js";

/**
 * Heading-order checking, statically.
 *
 * This is the cheap half of a two-part check, and its limits are worth stating
 * plainly rather than discovering later:
 *
 *   - It cannot see composition. A page whose only visible heading is an <h3>
 *     rendered by a shared component looks clean here. The Playwright pass
 *     queries the real DOM and is the authority; this exists for fast feedback
 *     while editing a file.
 *   - It assumes source order matches visual order. That holds in this
 *     codebase — there are no `order-*` utilities and no `flex-col-reverse` —
 *     but it is an assumption, not a guarantee.
 *   - Headings inside different branches of a conditional are a superset of
 *     what any single render shows, so only jumps that hold in every branch
 *     are reported.
 *
 * Scope is per component function rather than per file, because two components
 * in one file are two independent heading outlines.
 */

interface HeadingRef {
  level: number;
  offset: number;
  /** Depth of enclosing conditional expressions, used to skip branchy cases. */
  branchDepth: number;
}

const HEADING_TAG = /^h([1-6])$/;

function headingLevel(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): number | null {
  const tag = node.tagName.getText(sf);
  const match = HEADING_TAG.exec(tag);
  if (match) return Number(match[1]);

  // role="heading" aria-level={n}
  const attrs = node.attributes.properties;
  const isHeading = attrs.some(
    (a) =>
      ts.isJsxAttribute(a) &&
      a.name.getText(sf) === "role" &&
      a.initializer &&
      ts.isStringLiteral(a.initializer) &&
      a.initializer.text === "heading",
  );
  if (!isHeading) return null;

  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText(sf) !== "aria-level") continue;
    const init = attr.initializer;
    if (init && ts.isStringLiteral(init)) return Number(init.text);
    if (init && ts.isJsxExpression(init) && init.expression && ts.isNumericLiteral(init.expression)) {
      return Number(init.expression.text);
    }
  }
  return null;
}

/** Collects headings inside one function body, in source order. */
function headingsIn(node: ts.Node, sf: ts.SourceFile): HeadingRef[] {
  const out: HeadingRef[] = [];

  const walk = (current: ts.Node, branchDepth: number): void => {
    // Do not descend into a nested component — it has its own outline.
    if (current !== node && isComponentLike(current)) return;

    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      const level = headingLevel(current, sf);
      if (level !== null) out.push({ level, offset: current.getStart(sf), branchDepth });
    }

    const nextDepth =
      ts.isConditionalExpression(current) ||
      (ts.isBinaryExpression(current) &&
        (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          current.operatorToken.kind === ts.SyntaxKind.BarBarToken))
        ? branchDepth + 1
        : branchDepth;

    ts.forEachChild(current, (child) => walk(child, nextDepth));
  };

  walk(node, 0);
  return out;
}

function isComponentLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function componentName(node: ts.Node, sf: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.getText(sf);
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(sf);
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(sf);
  return "this component";
}

export function checkHeadingOrder(sf: ts.SourceFile, relativeFile: string): Finding[] {
  const out: Finding[] = [];

  const report = (offset: number, rule: string, title: string, message: string, offending: string, expected?: string): void => {
    const { line, column } = positionAt(sf, offset);
    out.push({
      id: nextId(rule),
      source: "static",
      severity: "error",
      rule,
      ruleTitle: title,
      message,
      offending,
      expected,
      file: relativeFile,
      line,
      column,
    });
  };

  const inspect = (node: ts.Node): void => {
    if (isComponentLike(node)) {
      const headings = headingsIn(node, sf);
      if (headings.length > 0) {
        const name = componentName(node, sf);

        // Headings inside a conditional are alternatives, not siblings: a
        // ternary rendering one <h1> per branch produces exactly one <h1> on
        // screen. Only unconditional headings can be compared with each other.
        const linear = headings.filter((h) => h.branchDepth === 0);

        const h1s = linear.filter((h) => h.level === 1);
        if (h1s.length > 1) {
          report(
            h1s[1]!.offset,
            "heading-order",
            "A screen has more than one main heading",
            `${name} has ${h1s.length} top-level headings. A screen should have exactly ` +
              `one — it is what tells a screen reader, and a search engine, what the page ` +
              `is about. Make the others section headings.`,
            "<h1>",
            "<h2>",
          );
        }

        for (let i = 1; i < linear.length; i += 1) {
          const previous = linear[i - 1]!;
          const current = linear[i]!;
          if (current.level > previous.level + 1) {
            report(
              current.offset,
              "heading-order",
              "A heading level is skipped",
              `${name} goes from a level ${previous.level} heading straight to level ` +
                `${current.level}. Heading levels are an outline — skipping one leaves a ` +
                `gap that makes the structure unreadable to anyone navigating by headings.`,
              `<h${current.level}>`,
              `<h${previous.level + 1}>`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, inspect);
  };

  inspect(sf);
  return out;
}
