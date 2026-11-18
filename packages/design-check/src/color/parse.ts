import type { RGB } from "./ciede2000.js";

/**
 * CSS colour parsing, deliberately partial.
 *
 * We handle the notations this codebase actually writes: hex (3/4/6/8 digit),
 * rgb()/rgba() in both comma and space syntax, and hsl()/hsla(). Anything
 * else — oklch(), lab(), color-mix(), colour keywords beyond the handful
 * below — returns null and is reported as "not analysed" rather than silently
 * skipped, so the gap is visible in the output instead of being mistaken for
 * a clean result.
 */

/** Matches any colour-looking token inside an arbitrary string. */
export const CSS_COLOR_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(/;

/** Notations we recognise but cannot convert. Reported, not ignored. */
export const UNSUPPORTED_COLOR_RE = /\b(?:oklch|oklab|lab|lch|color-mix)\s*\(/;

const NAMED: Record<string, RGB> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  transparent: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
};

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): RGB | null {
  const h = hex.slice(1);
  const expand = (s: string): number => parseInt(s + s, 16);

  if (h.length === 3 || h.length === 4) {
    return [expand(h[0]!), expand(h[1]!), expand(h[2]!)];
  }
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Splits `rgb(...)` arguments on commas or whitespace, dropping any `/ alpha`. */
function splitArgs(inner: string): string[] {
  return inner
    .split("/")[0]!
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function channel(token: string): number {
  return token.endsWith("%")
    ? clamp255((parseFloat(token) / 100) * 255)
    : clamp255(parseFloat(token));
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)];
}

/**
 * Parses a single CSS colour value to sRGB. Returns null for anything we
 * cannot faithfully convert — callers must treat null as "unknown", never as
 * "fine".
 */
export function parseColor(raw: string): RGB | null {
  const value = raw.trim().toLowerCase();

  if (value.startsWith("#")) return parseHex(value);
  if (value in NAMED) return NAMED[value]!;

  const fn = /^(rgba?|hsla?)\s*\(([^)]*)\)$/.exec(value);
  if (!fn) return null;

  const [, name, inner] = fn;
  const args = splitArgs(inner!);
  if (args.length < 3) return null;

  if (name!.startsWith("rgb")) {
    return [channel(args[0]!), channel(args[1]!), channel(args[2]!)];
  }

  const h = parseFloat(args[0]!);
  const s = parseFloat(args[1]!) / 100;
  const l = parseFloat(args[2]!) / 100;
  if (![h, s, l].every(Number.isFinite)) return null;
  return hslToRgb(h, s, l);
}

/** Extracts every colour-looking token from an arbitrary string. */
export function findColorTokens(text: string): string[] {
  const out: string[] = [];
  const hexes = text.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hexes) out.push(...hexes);
  const fns = text.match(
    /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\([^)]*\)/g,
  );
  if (fns) out.push(...fns);
  return out;
}

export function formatHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
