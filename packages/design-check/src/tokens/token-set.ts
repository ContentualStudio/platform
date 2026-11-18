import { deltaE00, rgbToLab, type Lab, type RGB } from "../color/ciede2000.js";

export type Theme = "light" | "dark";

export interface ColorToken {
  /** Tailwind-facing name without the namespace, e.g. "accent" for --color-accent. */
  name: string;
  /** The --ds-* variable it resolves through, or null if it was a literal. */
  ref: string | null;
  light: RGB;
  dark: RGB;
  lightLab: Lab;
  darkLab: Lab;
  line: number;
}

export interface ScalarToken {
  name: string;
  px: number;
  ref: string | null;
  line: number;
}

export interface FontSizeToken {
  name: string;
  px: number;
  /** Raw value, so `clamp(...)` fluid tokens survive intact. */
  raw: string;
  fluid: boolean;
  lineHeight?: string;
  letterSpacing?: string;
  fontWeight?: string;
  line: number;
}

export interface RawDecl {
  prop: string;
  value: string;
  line: number;
}

export interface TokenSet {
  /** Every --ds-* declaration, per theme. Dark inherits light where absent. */
  ds: { light: Map<string, RawDecl>; dark: Map<string, RawDecl> };
  /** Every @theme inline declaration, in source order. */
  theme: Map<string, RawDecl>;
  /** Declarations outside :root/[data-theme]/@theme — element rules, layers. */
  otherDecls: RawDecl[];

  colors: ColorToken[];
  radii: ScalarToken[];
  fontSizes: FontSizeToken[];
  /** Tailwind's --spacing base in px. The whole spacing scale derives from it. */
  spacingBasePx: number;
  leading: Map<string, string>;
  tracking: Map<string, string>;
  shadows: RawDecl[];
}

export interface NearestColor {
  token: ColorToken;
  theme: Theme;
  distance: number;
}

/**
 * Finds the closest design token to an arbitrary colour, searching both
 * themes. Callers use the distance to decide what to say: a close match means
 * "use this token", a distant one means "no token covers this colour".
 */
export function nearestColor(
  rgb: RGB,
  colors: readonly ColorToken[],
): NearestColor | null {
  const lab = rgbToLab(rgb);
  let best: NearestColor | null = null;

  for (const token of colors) {
    for (const theme of ["light", "dark"] as const) {
      const distance = deltaE00(
        lab,
        theme === "light" ? token.lightLab : token.darkLab,
      );
      if (!best || distance < best.distance) best = { token, theme, distance };
    }
  }
  return best;
}

/**
 * Above this ΔE00 there is no honest "use X instead" — the colour is simply
 * absent from the design system and needs a token or removal.
 */
export const NO_USEFUL_MATCH_DELTA = 8;

export function nearestScalar(
  px: number,
  tokens: readonly ScalarToken[],
): ScalarToken | null {
  let best: ScalarToken | null = null;
  for (const token of tokens) {
    if (!best || Math.abs(token.px - px) < Math.abs(best.px - px)) best = token;
  }
  return best;
}

export function nearestFontSize(
  px: number,
  tokens: readonly FontSizeToken[],
): FontSizeToken | null {
  let best: FontSizeToken | null = null;
  for (const token of tokens) {
    if (token.fluid) continue;
    if (!best || Math.abs(token.px - px) < Math.abs(best.px - px)) best = token;
  }
  return best;
}

/** Converts a CSS length to px. Returns null for anything not a fixed length. */
export function toPx(value: string, rootFontSizePx = 16): number | null {
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;

  const n = parseFloat(match[1]!);
  if (!Number.isFinite(n)) return null;

  switch (match[2]) {
    case "rem":
    case "em":
      return n * rootFontSizePx;
    case "px":
    case undefined:
      return n;
    default:
      return null;
  }
}
