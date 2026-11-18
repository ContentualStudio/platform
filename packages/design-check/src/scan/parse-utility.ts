/**
 * Splits a Tailwind utility into the parts the rules need.
 *
 * Variants are stripped by scanning for `:` outside brackets, so
 * `data-[state=open]:hover:rounded-[13px]` yields base `rounded` with the
 * arbitrary value `13px` — a naive `split(":")` would tear the data attribute
 * selector in half.
 */

export interface Utility {
  /** The whole class as written. */
  raw: string;
  /** Variant prefixes in order, e.g. ["md", "hover"]. */
  variants: string[];
  /** Utility name without value, e.g. "text", "rounded", "max-w". */
  base: string;
  /** Contents of `[...]`, or null for a named utility. */
  arbitrary: string | null;
  /** The named suffix, e.g. "sm" in `text-sm`, or null when arbitrary. */
  named: string | null;
  /** Opacity modifier after `/`, e.g. "50" in `bg-accent/50`. */
  modifier: string | null;
  negative: boolean;
  important: boolean;
}

/** Splits on a character only when it appears outside [] and (). */
function splitOutsideBrackets(text: string, on: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of text) {
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;

    if (char === on && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Known multi-word utility bases. Without these, `max-w-[420px]` would parse
 * as base `max` and `min-h-15` as base `min`.
 */
const COMPOUND_BASES = [
  "max-w", "max-h", "min-w", "min-h", "text-shadow",
  "gap-x", "gap-y", "space-x", "space-y",
  "scroll-m", "scroll-p", "inset-x", "inset-y",
  "border-x", "border-y", "border-t", "border-r", "border-b", "border-l",
  "rounded-t", "rounded-r", "rounded-b", "rounded-l",
  "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl",
  "rounded-ss", "rounded-se", "rounded-ee", "rounded-es",
  "divide-x", "divide-y", "text-decoration", "grid-cols", "grid-rows",
  "col-span", "row-span", "outline-offset", "ring-offset",
];

export function parseUtility(raw: string): Utility | null {
  if (!raw || (raw.includes(" ") && !raw.includes("("))) return null;

  const segments = splitOutsideBrackets(raw, ":");
  const body = segments.pop();
  if (!body) return null;
  const variants = segments;

  let rest = body;
  const important = rest.startsWith("!");
  if (important) rest = rest.slice(1);
  const negative = rest.startsWith("-");
  if (negative) rest = rest.slice(1);

  // Split off an opacity modifier, but only outside brackets — an arbitrary
  // value can legitimately contain a slash (`rgb(0 0 0 / 0.12)`).
  const modifierParts = splitOutsideBrackets(rest, "/");
  const modifier = modifierParts.length > 1 ? (modifierParts.pop() ?? null) : null;
  rest = modifierParts.join("/");

  const arbitraryMatch = /^(.+?)-\[(.*)\]$/.exec(rest);
  if (arbitraryMatch) {
    return {
      raw,
      variants,
      base: arbitraryMatch[1]!,
      arbitrary: arbitraryMatch[2]!,
      named: null,
      modifier,
      negative,
      important,
    };
  }

  // Named utility: prefer the longest known compound base.
  const compound = COMPOUND_BASES.filter((b) => rest.startsWith(`${b}-`)).sort(
    (a, b) => b.length - a.length,
  )[0];
  if (compound) {
    return {
      raw,
      variants,
      base: compound,
      arbitrary: null,
      named: rest.slice(compound.length + 1),
      modifier,
      negative,
      important,
    };
  }

  const dash = rest.indexOf("-");
  if (dash === -1) {
    return { raw, variants, base: rest, arbitrary: null, named: null, modifier, negative, important };
  }
  return {
    raw,
    variants,
    base: rest.slice(0, dash),
    arbitrary: null,
    named: rest.slice(dash + 1),
    modifier,
    negative,
    important,
  };
}

/** Every utility in a class string, skipping empties. */
export function parseClassString(text: string): Array<{ utility: Utility; index: number }> {
  const out: Array<{ utility: Utility; index: number }> = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const utility = parseUtility(match[0]);
    if (utility) out.push({ utility, index: match.index });
  }
  return out;
}

// --- utility classification -------------------------------------------

export const COLOUR_BASES = new Set([
  "bg", "text", "border", "ring", "divide", "outline", "fill", "stroke",
  "shadow", "from", "via", "to", "decoration", "accent", "caret", "placeholder",
  "border-x", "border-y", "border-t", "border-r", "border-b", "border-l",
  "divide-x", "divide-y", "ring-offset",
]);

/** Padding, margin and gap — the properties the brief names explicitly. */
export const SPACING_BASES = new Set([
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
  "gap", "gap-x", "gap-y", "space-x", "space-y",
  "scroll-m", "scroll-p",
]);

/**
 * Container and layout measurements. Reported as warnings rather than errors:
 * forcing a 4px lattice onto a max-width produces tokens like `--spacing-105`
 * that mean nothing, and these are layout decisions rather than scale ones.
 */
export const SIZE_BASES = new Set([
  "w", "h", "size", "min-w", "min-h", "max-w", "max-h",
  "top", "right", "bottom", "left", "inset", "inset-x", "inset-y",
  "basis", "translate-x", "translate-y",
]);

export const RADIUS_BASES = new Set([
  "rounded", "rounded-t", "rounded-r", "rounded-b", "rounded-l",
  "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl",
  "rounded-ss", "rounded-se", "rounded-ee", "rounded-es",
]);

/**
 * Arbitrary values that are not design-scale decisions and are out of scope:
 * media-query variants, animation names, grid track definitions, z-indexes,
 * transition property lists and transforms.
 */
export const OUT_OF_SCOPE_BASES = new Set([
  "animate", "grid-cols", "grid-rows", "z", "transition", "scale", "rotate",
  "duration", "delay", "aspect", "content", "will-change", "mask", "bg-image",
  "col-span", "row-span", "order", "flex", "grow", "shrink", "line-clamp",
]);
