import postcss, { type ChildNode, type Declaration } from "postcss";

import { rgbToLab, type RGB } from "../color/ciede2000.js";
import { parseColor } from "../color/parse.js";
import {
  toPx,
  type ColorToken,
  type FontSizeToken,
  type RawDecl,
  type ScalarToken,
  type TokenSet,
} from "./token-set.js";

/**
 * Parses globals.css into the token model.
 *
 * postcss rather than regex, and not out of purism — this specific file
 * breaks naive matching in three ways. `--font-metropolis` spans four lines
 * with quoted strings containing commas. Five `@keyframes` blocks and the
 * `.contentual-*` rules in `@layer components` contain declarations that a
 * flat `/--[\w-]+:\s*(.+);/` sweep would happily read as design tokens. And
 * the component layer carries comments mid-block.
 */

/** Tailwind v4's default spacing base. Every bare numeric utility uses it. */
const TAILWIND_DEFAULT_SPACING_PX = 4;

const VAR_REF = /^var\(\s*(--[\w-]+)\s*\)$/;

/** Values that are legitimately literal in @theme inline — not token drift. */
export const ALLOWED_THEME_LITERALS = new Set([
  "0",
  "0px",
  "9999px",
  "none",
  "transparent",
  "currentColor",
  "initial",
  "inherit",
]);

export function refOf(value: string): string | null {
  return VAR_REF.exec(value.trim())?.[1] ?? null;
}

interface Buckets {
  themeInline: Declaration[];
  rootVars: Declaration[];
  darkVars: Declaration[];
  other: Declaration[];
}

function collect(nodes: ChildNode[], into: Buckets, context: keyof Buckets): void {
  for (const node of nodes) {
    if (node.type === "decl") {
      into[context].push(node);
      continue;
    }

    if (node.type === "rule") {
      // Descend into rules, but keyframe steps and component rules are never
      // token definitions — they land in `other` and are only used by the
      // hardcoded-literal audit.
      const selector = node.selector.trim();
      const next =
        selector === ":root"
          ? "rootVars"
          : /^\[data-theme=["']?dark["']?\]$/.test(selector)
            ? "darkVars"
            : "other";
      collect(node.nodes ?? [], into, next);
      continue;
    }

    if (node.type === "atrule") {
      const isThemeInline =
        node.name === "theme" && /\binline\b/.test(node.params ?? "");
      collect(node.nodes ?? [], into, isThemeInline ? "themeInline" : "other");
    }
  }
}

function toRawDecl(decl: Declaration): RawDecl {
  return {
    prop: decl.prop,
    // Collapse the multi-line font stacks so downstream comparison is sane.
    value: decl.value.replace(/\s+/g, " ").trim(),
    line: decl.source?.start?.line ?? 0,
  };
}

/**
 * Resolves a @theme inline value through one level of var() indirection into
 * the --ds-* layer. Returns the raw value when it is already a literal.
 */
function resolveValue(
  value: string,
  ds: Map<string, RawDecl>,
): string | null {
  const ref = refOf(value);
  if (!ref) return value;
  return ds.get(ref)?.value ?? null;
}

export function parseGlobals(css: string, from: string): TokenSet {
  const root = postcss.parse(css, { from });
  const buckets: Buckets = {
    themeInline: [],
    rootVars: [],
    darkVars: [],
    other: [],
  };
  collect(root.nodes, buckets, "other");

  const light = new Map<string, RawDecl>();
  const dark = new Map<string, RawDecl>();
  const theme = new Map<string, RawDecl>();

  for (const decl of buckets.rootVars) {
    if (decl.prop.startsWith("--")) light.set(decl.prop, toRawDecl(decl));
  }
  // Dark inherits every light token it does not override.
  for (const [name, decl] of light) dark.set(name, decl);
  for (const decl of buckets.darkVars) {
    if (decl.prop.startsWith("--")) dark.set(decl.prop, toRawDecl(decl));
  }
  for (const decl of buckets.themeInline) {
    if (decl.prop.startsWith("--")) theme.set(decl.prop, toRawDecl(decl));
  }

  const colors: ColorToken[] = [];
  const radii: ScalarToken[] = [];
  const fontSizes: FontSizeToken[] = [];
  const leading = new Map<string, string>();
  const tracking = new Map<string, string>();
  const shadows: RawDecl[] = [];
  let spacingBasePx = TAILWIND_DEFAULT_SPACING_PX;

  const fontSizeModifiers = new Map<string, RawDecl>();

  for (const [prop, decl] of theme) {
    const ref = refOf(decl.value);

    if (prop.startsWith("--color-")) {
      const lightRaw = resolveValue(decl.value, light);
      const darkRaw = resolveValue(decl.value, dark);
      const lightRgb = lightRaw ? parseColor(lightRaw) : null;
      const darkRgb = darkRaw ? parseColor(darkRaw) : null;
      // A colour we cannot resolve is reported by the self-audit; it must not
      // silently join the legal set as some default.
      if (!lightRgb || !darkRgb) continue;
      colors.push({
        name: prop.slice("--color-".length),
        ref,
        light: lightRgb,
        dark: darkRgb,
        lightLab: rgbToLab(lightRgb),
        darkLab: rgbToLab(darkRgb),
        line: decl.line,
      });
      continue;
    }

    if (prop.startsWith("--radius-")) {
      const resolved = resolveValue(decl.value, light);
      const px = resolved ? toPx(resolved) : null;
      if (px !== null) {
        radii.push({ name: prop.slice("--radius-".length), px, ref, line: decl.line });
      }
      continue;
    }

    if (prop === "--spacing") {
      const px = toPx(resolveValue(decl.value, light) ?? decl.value);
      if (px !== null) spacingBasePx = px;
      continue;
    }

    if (prop.startsWith("--text-")) {
      // Tailwind v4 pairs a size with modifiers named --text-<name>--<prop>.
      if (prop.includes("--", 2) && /--(line-height|letter-spacing|font-weight)$/.test(prop)) {
        fontSizeModifiers.set(prop, decl);
      } else {
        const raw = resolveValue(decl.value, light) ?? decl.value;
        const fluid = raw.includes("clamp(") || raw.includes("vw");
        // For a fluid token, the largest endpoint is what we compare against.
        const px = fluid ? fluidMaxPx(raw) : toPx(raw);
        fontSizes.push({
          name: prop.slice("--text-".length),
          px: px ?? 0,
          raw,
          fluid,
          line: decl.line,
        });
      }
      continue;
    }

    if (prop.startsWith("--leading-")) {
      leading.set(prop.slice("--leading-".length), decl.value);
      continue;
    }
    if (prop.startsWith("--tracking-")) {
      tracking.set(prop.slice("--tracking-".length), decl.value);
      continue;
    }
    if (prop.startsWith("--shadow-")) shadows.push(decl);
  }

  // Attach modifiers to their size.
  for (const [prop, decl] of fontSizeModifiers) {
    const match = /^--text-(.+?)--(line-height|letter-spacing|font-weight)$/.exec(prop);
    if (!match) continue;
    const token = fontSizes.find((t) => t.name === match[1]);
    if (!token) continue;
    if (match[2] === "line-height") token.lineHeight = decl.value;
    if (match[2] === "letter-spacing") token.letterSpacing = decl.value;
    if (match[2] === "font-weight") token.fontWeight = decl.value;
  }

  return {
    ds: { light, dark },
    theme,
    otherDecls: buckets.other.map(toRawDecl),
    colors,
    radii,
    fontSizes,
    spacingBasePx,
    leading,
    tracking,
    shadows,
  };
}

/** Largest endpoint of a clamp()/fluid expression, in px. */
export function fluidMaxPx(raw: string): number | null {
  const clamp = /clamp\(\s*([^,]+),([^,]+),([^)]+)\)/.exec(raw);
  if (!clamp) return null;
  return toPx(clamp[3]!.trim());
}

export function fluidMinPx(raw: string): number | null {
  const clamp = /clamp\(\s*([^,]+),([^,]+),([^)]+)\)/.exec(raw);
  if (!clamp) return null;
  return toPx(clamp[1]!.trim());
}

/** Every --ds-* name referenced anywhere in the file, for dead-token detection. */
export function referencedDsVars(css: string): Set<string> {
  const out = new Set<string>();
  for (const match of css.matchAll(/var\(\s*(--ds-[\w-]+)/g)) out.add(match[1]!);
  return out;
}
