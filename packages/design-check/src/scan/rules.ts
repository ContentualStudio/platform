import type { AllowlistMatcher } from "../allowlist.js";
import { formatHex, findColorTokens, parseColor, UNSUPPORTED_COLOR_RE } from "../color/parse.js";
import { nextId, type Finding, type Severity } from "../report/findings.js";
import {
  nearestColor,
  nearestFontSize,
  nearestScalar,
  toPx,
  NO_USEFUL_MATCH_DELTA,
  type TokenSet,
} from "../tokens/token-set.js";
import ts from "typescript";

import { positionAt, type ClassCandidate } from "./extract-classes.js";
import {
  COLOUR_BASES,
  OUT_OF_SCOPE_BASES,
  parseClassString,
  RADIUS_BASES,
  SIZE_BASES,
  SPACING_BASES,
  type Utility,
} from "./parse-utility.js";

export interface RuleContext {
  tokens: TokenSet;
  allowlist: AllowlistMatcher;
  /** Repo-relative path, for reporting. */
  relativeFile: string;
  /** The parsed file, for line/column resolution. */
  sourceFile: ts.SourceFile;
  /** --ds-* names this file reaches through var(), for the dead-token rule. */
  referencedTokens: Set<string>;
}

/**
 * The legal names for each namespace we control, derived from the token set.
 *
 * Memoised per TokenSet because `checkNamedToken` runs once per named utility
 * — 3,391 times on this repo — and rebuilding five Sets from ~160 spread
 * elements each time cost more than the rest of the call-site scan put
 * together.
 */
const NAMESPACE_CACHE = new WeakMap<TokenSet, NamespaceTable>();

interface NamespaceTable {
  byBase: Record<string, { names: Set<string>; label: string }>;
  radius: { names: Set<string>; label: string };
}

function namespacesFor(tokens: TokenSet): NamespaceTable {
  const cached = NAMESPACE_CACHE.get(tokens);
  if (cached) return cached;

  const colourNames = tokens.colors.map((c) => c.name);
  const table: NamespaceTable = {
    byBase: {
      text: {
        names: new Set([
          ...tokens.fontSizes.map((t) => t.name),
          // `text-*` is overloaded: it is also the colour utility.
          ...colourNames,
          "left", "center", "right", "justify", "start", "end",
          "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
        ]),
        label: "text size",
      },
      leading: { names: new Set(tokens.leading.keys()), label: "line height" },
      tracking: { names: new Set(tokens.tracking.keys()), label: "letter spacing" },
      shadow: {
        names: new Set([
          ...tokens.shadows.map((s) => s.prop.slice("--shadow-".length)),
          ...colourNames,
          "inner",
        ]),
        label: "shadow",
      },
    },
    radius: {
      names: new Set([...tokens.radii.map((r) => r.name), "full", "none"]),
      label: "corner radius",
    },
  };

  NAMESPACE_CACHE.set(tokens, table);
  return table;
}

export interface ScanCounters {
  unanalysedColorNotations: number;
}

function at(ctx: RuleContext, candidate: ClassCandidate, indexInText: number) {
  const { line, column } = positionAt(ctx.sourceFile, candidate.offset + indexInText);
  return { file: ctx.relativeFile, line, column };
}

function make(
  ctx: RuleContext,
  candidate: ClassCandidate,
  indexInText: number,
  rule: string,
  ruleTitle: string,
  message: string,
  offending: string,
  expected: string | undefined,
  severity: Severity = "error",
  fix?: string,
): Finding {
  return {
    id: nextId(rule),
    source: "static",
    severity,
    rule,
    ruleTitle,
    message,
    offending,
    expected,
    fix,
    ...at(ctx, candidate, indexInText),
  };
}

/** Re-attaches a utility's variants and modifiers to a replacement base. */
function withVariants(utility: Utility, replacement: string): string {
  const prefix = utility.variants.length ? `${utility.variants.join(":")}:` : "";
  const bang = utility.important ? "!" : "";
  const suffix = utility.modifier ? `/${utility.modifier}` : "";
  return `${prefix}${bang}${replacement}${suffix}`;
}

/**
 * A value that resolves through a design token already, e.g.
 * `text-[var(--ds-fg-soft)]`. Not a literal, but still worth flagging at a
 * lower severity: a token reached through an arbitrary value bypasses the
 * utility layer, so it will not pick up a rename.
 */
function isVarReference(value: string): boolean {
  return value.trim().startsWith("var(");
}

// --- R1: colour literals ------------------------------------------------

function checkColour(
  ctx: RuleContext,
  candidate: ClassCandidate,
  counters: ScanCounters,
): Finding[] {
  const out: Finding[] = [];
  const text = candidate.text;

  for (const token of findColorTokens(text)) {
    const index = text.indexOf(token);

    // Counted before anything else: a notation we cannot convert is a gap in
    // coverage wherever it appears, and it has to stay visible rather than
    // being filtered out as somebody else's job.
    if (UNSUPPORTED_COLOR_RE.test(token)) {
      counters.unanalysedColorNotations += 1;
      continue;
    }

    // Colours inside a colour utility are reported by checkArbitraryColour,
    // which can propose a replacement for the whole class rather than just
    // the value.
    if (index > 0 && text[index - 1] === "[") continue;
    if (ctx.allowlist.allows(ctx.relativeFile, "colour-literal", token)) continue;

    const rgb = parseColor(token);
    if (!rgb) continue;

    const nearest = nearestColor(rgb, ctx.tokens.colors);
    const hasMatch = nearest && nearest.distance <= NO_USEFUL_MATCH_DELTA;

    const expected = hasMatch
      ? `${nearest.token.name} (${formatHex(
          nearest.theme === "light" ? nearest.token.light : nearest.token.dark,
        )})`
      : undefined;

    const message = hasMatch
      ? `The colour ${token} is written directly instead of using the design system. ` +
        `The closest colour in the system is "${nearest.token.name}" — use that, so this ` +
        `element follows the theme and changes when the palette does.`
      : `The colour ${token} is written directly and no colour in the design system is ` +
        `close to it. Either add it to the system as a named colour, or replace it with ` +
        `one that is already there.`;

    out.push(
      make(ctx, candidate, index, "colour-literal", "A colour is hardcoded", message, token, expected),
    );
  }
  return out;
}

/** Tailwind's built-in palette, which globals.css does not retire. */
const TAILWIND_COLOUR_RAMPS = new Set([
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]);
const TAILWIND_BARE_COLOURS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
};

export function isTailwindDefaultColour(name: string): boolean {
  if (name in TAILWIND_BARE_COLOURS) return true;
  if (name === "transparent" || name === "current" || name === "inherit") return true;
  const ramp = /^([a-z]+)-\d{2,3}$/.exec(name);
  return ramp ? TAILWIND_COLOUR_RAMPS.has(ramp[1]!) : false;
}

/** Reports a Tailwind palette colour as off-system, with the nearest token. */
function colourNameFinding(
  ctx: RuleContext,
  candidate: ClassCandidate,
  utility: Utility,
  index: number,
): Finding[] {
  const { named, raw, base } = utility;
  if (named === null) return [];
  if (named === "transparent" || named === "current" || named === "inherit") return [];
  if (ctx.allowlist.allows(ctx.relativeFile, "colour-literal", raw)) return [];

  const rgb = TAILWIND_BARE_COLOURS[named];
  const nearest = rgb ? nearestColor(rgb, ctx.tokens.colors) : null;
  const usable = nearest && nearest.distance <= NO_USEFUL_MATCH_DELTA;

  return [
    make(
      ctx,
      candidate,
      index,
      "colour-literal",
      "A colour comes from outside the design system",
      `"${raw}" uses one of the framework's own colours rather than one of ours. It will ` +
        `render, but it will not follow the light and dark themes — which is how a white ` +
        `label ends up invisible on a white background.` +
        (usable ? ` The design system's equivalent is "${nearest.token.name}".` : ""),
      raw,
      usable ? `${base}-${nearest.token.name}` : undefined,
      "error",
      usable ? withVariants(utility, `${base}-${nearest.token.name}`) : undefined,
    ),
  ];
}

// --- R6: named utilities whose token does not exist ---------------------

/**
 * Catches a named utility in a namespace we control whose token is not
 * defined.
 *
 * This is the safety net for the `--text-*: initial` / `--radius-*: initial`
 * resets in globals.css. Retiring Tailwind's stock ladders is what gives the
 * app a single scale, but the failure mode is silent: a class like `text-7xl`
 * whose token no longer exists makes Tailwind emit nothing at all, and the
 * element simply inherits. No error, no warning, just the wrong size. The
 * legal set here is derived from the resolved theme, so the check is its own
 * safety net for its own token change.
 */
function checkNamedToken(
  ctx: RuleContext,
  candidate: ClassCandidate,
  utility: Utility,
  index: number,
): Finding[] {
  const { base, named, raw } = utility;
  if (named === null) return [];

  const table = namespacesFor(ctx.tokens);
  const space = RADIUS_BASES.has(base) ? table.radius : table.byBase[base];
  if (!space) return [];

  if (space.names.has(named)) return [];

  // Numeric suffixes derive from the spacing scale rather than a named token
  // (`leading-5` is calc(var(--spacing) * 5)), so they remain valid.
  if (/^\d+(\.\d+)?$/.test(named)) return [];

  // Tailwind ships its own colour palette, which we deliberately did not
  // retire. Those names resolve fine — they are simply outside the design
  // system, which is a colour problem and reads better said that way.
  if (isTailwindDefaultColour(named)) {
    return colourNameFinding(ctx, candidate, utility, index);
  }

  return [
    make(
      ctx,
      candidate,
      index,
      "unknown-token",
      "A utility points at a token that does not exist",
      `"${raw}" asks for a ${space.label} called "${named}", which the design system ` +
        `does not define. This does not fail loudly — the style is simply not applied and ` +
        `the element inherits whatever its parent had. Use one of: ` +
        `${[...space.names].slice(0, 12).join(", ")}.`,
      raw,
      undefined,
    ),
  ];
}

/**
 * A colour written as an arbitrary value on a colour utility, e.g.
 * `bg-[#e8f0fe]`.
 *
 * Handled here rather than in the raw-string sweep because the fix has to
 * replace the whole class: swapping just the hex would produce
 * `bg-[tint-blue-soft]`, which is not a class at all.
 */
function checkArbitraryColour(
  ctx: RuleContext,
  candidate: ClassCandidate,
  utility: Utility,
  index: number,
): Finding[] {
  const { base, arbitrary, raw } = utility;
  if (arbitrary === null) return [];
  if (isVarReference(arbitrary)) return [];

  const rgb = parseColor(arbitrary);
  if (!rgb) return [];
  if (ctx.allowlist.allows(ctx.relativeFile, "colour-literal", arbitrary)) return [];

  const nearest = nearestColor(rgb, ctx.tokens.colors);
  const usable = nearest && nearest.distance <= NO_USEFUL_MATCH_DELTA;
  const exact = nearest && nearest.distance === 0;

  return [
    make(
      ctx,
      candidate,
      index,
      "colour-literal",
      "A colour is hardcoded",
      usable
        ? `The colour ${arbitrary} is written directly instead of using the design ` +
          `system.${exact ? " It is exactly" : " The closest colour in the system is"} ` +
          `"${nearest.token.name}" — use that, so this element follows the light and ` +
          `dark themes and changes when the palette does.`
        : `The colour ${arbitrary} is written directly and no colour in the design ` +
          `system is close to it. Either add it to the system as a named colour, or ` +
          `replace it with one that is already there.`,
      raw,
      usable
        ? `${base}-${nearest.token.name} (${formatHex(
            nearest.theme === "light" ? nearest.token.light : nearest.token.dark,
          )})`
        : undefined,
      "error",
      usable ? withVariants(utility, `${base}-${nearest.token.name}`) : undefined,
    ),
  ];
}

// --- R2–R5: utility rules ----------------------------------------------

function checkUtility(
  ctx: RuleContext,
  candidate: ClassCandidate,
  utility: Utility,
  index: number,
): Finding[] {
  const { base, arbitrary, named, raw } = utility;

  /*
   * Record every --ds-* the value reaches, wherever it sits. Only counting
   * values that *begin* with var() missed --ds-accent-glow inside
   * `bg-[radial-gradient(ellipse,var(--ds-accent-glow)…)]`, and the dead-token
   * rule then told you to delete a token that was in use.
   */
  if (arbitrary !== null) {
    for (const match of arbitrary.matchAll(/var\(\s*(--[\w-]+)/g)) {
      ctx.referencedTokens.add(match[1]!);
    }
  }

  if (arbitrary !== null && COLOUR_BASES.has(base)) {
    const colourFix = checkArbitraryColour(ctx, candidate, utility, index);
    if (colourFix.length > 0) return colourFix;
  }

  if (arbitrary === null) {
    return named === null ? [] : checkNamedToken(ctx, candidate, utility, index);
  }
  if (OUT_OF_SCOPE_BASES.has(base)) return [];
  if (ctx.allowlist.allows(ctx.relativeFile, "arbitrary-value", raw)) return [];

  // A token reached through an arbitrary value.
  if (isVarReference(arbitrary)) {
    const ref = /var\(\s*(--[\w-]+)/.exec(arbitrary)?.[1];
    if (!ref) return [];

    // The variable may not exist at all. This is what a deleted token leaves
    // behind: var(--ds-accent-hot), once --ds-accent-hot is removed, resolves
    // to nothing and the whole declaration is dropped.
    if (!ctx.tokens.ds.light.has(ref)) {
      return [
        make(
          ctx,
          candidate,
          index,
          "dead-token-reference",
          "A style points at a token that was removed",
          `"${raw}" refers to ${ref}, which no longer exists in the design system. The ` +
            `browser cannot resolve it, so this style is silently dropped and the element ` +
            `falls back to whatever it inherited.`,
          raw,
          undefined,
        ),
      ];
    }

    const utilityName = ctx.tokens.colors.find((c) => c.ref === ref)?.name;
    const replacement = utilityName ? withVariants(utility, `${base}-${utilityName}`) : undefined;
    return [
      make(
        ctx,
        candidate,
        index,
        "token-via-arbitrary",
        "A token is used the long way round",
        `"${raw}" reaches a design token through an arbitrary value. It renders correctly, ` +
          `but it bypasses the utility layer, so it will not follow a rename and will not ` +
          `be found by anyone searching for the utility.`,
        raw,
        replacement,
        "warning",
        replacement,
      ),
    ];
  }

  // R2 — font size.
  if (base === "text") {
    const px = toPx(arbitrary);
    if (px === null) {
      // A clamp() or vw expression: must use a fluid token.
      if (/clamp\(|vw/.test(arbitrary)) {
        const fluid = ctx.tokens.fontSizes.filter((t) => t.fluid);
        return [
          make(
            ctx,
            candidate,
            index,
            "font-size",
            "A text size is set outside the type scale",
            `"${raw}" sizes text with its own formula rather than using one of the ` +
              `scale's fluid sizes. Headings that grow with the screen should come from ` +
              `the scale so they always land on a size that exists in it.`,
            raw,
            fluid.map((t) => `text-${t.name}`).join(", ") || undefined,
          ),
        ];
      }
      return [];
    }

    const nearest = nearestFontSize(px, ctx.tokens.fontSizes);
    if (!nearest) return [];
    const exact = nearest.px === px;
    return [
      make(
        ctx,
        candidate,
        index,
        "font-size",
        "A text size is set outside the type scale",
        exact
          ? `This text is ${`${px} pixels`}. The scale's "${nearest.name}" size is also ` +
            `${`${px} pixels`} — use "text-${nearest.name}" so it stays in step with the ` +
            `rest of the type.`
          : `This text is ${`${px} pixels`}, which is not on the type scale. The nearest ` +
            `size in the scale is "${nearest.name}" at ${`${nearest.px} pixels`}.`,
        raw,
        `text-${nearest.name} (${nearest.px}px)`,
        "error",
        withVariants(utility, `text-${nearest.name}`),
      ),
    ];
  }

  // R4 — radius.
  if (RADIUS_BASES.has(base)) {
    const px = toPx(arbitrary);
    if (px === null) return [];
    const nearest = nearestScalar(px, ctx.tokens.radii);
    if (!nearest) return [];
    const suffix = base === "rounded" ? "" : base.slice("rounded".length);
    return [
      make(
        ctx,
        candidate,
        index,
        "radius",
        "A corner radius is set outside the radius scale",
        nearest.px === px
          ? `This corner is rounded by ${`${px} pixels`}, which the scale already calls ` +
            `"${nearest.name}". Use the name so every corner of this size changes together.`
          : `This corner is rounded by ${`${px} pixels`}, which is not on the radius ` +
            `scale. The nearest step is "${nearest.name}" at ${`${nearest.px} pixels`}.`,
        raw,
        `rounded${suffix}-${nearest.name} (${nearest.px}px)`,
        "error",
        withVariants(utility, `${base}-${nearest.name}`),
      ),
    ];
  }

  // R3 — padding, margin, gap.
  if (SPACING_BASES.has(base)) {
    const px = toPx(arbitrary);
    if (px === null) return [];
    const step = px / ctx.tokens.spacingBasePx;
    const onScale = Number.isInteger(step);
    const nearestStep = Math.round(step);
    return [
      make(
        ctx,
        candidate,
        index,
        "spacing",
        "Spacing is set outside the spacing scale",
        onScale
          ? `This spacing is ${`${px} pixels`}, which is step ${step} on the spacing ` +
            `scale. Write it as "${base}-${step}" so it moves with the scale instead of ` +
            `being pinned to a pixel value.`
          : `This spacing is ${`${px} pixels`}, which is not on the ${ctx.tokens.spacingBasePx}-pixel ` +
            `spacing scale. The nearest step is ${nearestStep}, which is ` +
            `${`${nearestStep * ctx.tokens.spacingBasePx} pixels`}.`,
        raw,
        `${base}-${nearestStep}`,
        "error",
        onScale ? withVariants(utility, `${base}-${step}`) : undefined,
      ),
    ];
  }

  // R5 — line height and letter spacing.
  if (base === "leading" || base === "tracking") {
    const scale = base === "leading" ? ctx.tokens.leading : ctx.tokens.tracking;

    const match = [...scale.entries()].find(
      ([, value]) => value.trim() === arbitrary.trim(),
    );
    const label = base === "leading" ? "line height" : "letter spacing";
    return [
      make(
        ctx,
        candidate,
        index,
        base === "leading" ? "line-height" : "letter-spacing",
        `A ${label} is set outside the scale`,
        match
          ? `This ${label} is ${arbitrary}, which the scale calls "${match[0]}". Use ` +
            `"${base}-${match[0]}".`
          : `This ${label} is ${arbitrary}, which is not one of the values in the scale. ` +
            `Most text should take its ${label} from its size rather than setting one.`,
        raw,
        match ? `${base}-${match[0]}` : undefined,
        "error",
        match ? withVariants(utility, `${base}-${match[0]}`) : undefined,
      ),
    ];
  }

  // R3b — container and layout measurements. Warning, not error.
  if (SIZE_BASES.has(base)) {
    const px = toPx(arbitrary);
    if (px === null) return [];
    const step = px / ctx.tokens.spacingBasePx;
    if (Number.isInteger(step)) {
      return [
        make(
          ctx,
          candidate,
          index,
          "layout-size",
          "A layout measurement could use the scale",
          `This is ${`${px} pixels`}, which is step ${step} on the spacing scale. ` +
            `Writing it as "${base}-${step}" is not required — container sizes are a ` +
            `layout decision rather than a scale one — but it keeps the value readable.`,
          raw,
          `${base}-${step}`,
          "warning",
        ),
      ];
    }
    return [
      make(
        ctx,
        candidate,
        index,
        "layout-size",
        "A layout measurement is an unexplained number",
        `This is ${`${px} pixels`}, which is not on the spacing scale and has no name. ` +
          `If it is a deliberate container width, it is worth giving it one.`,
        raw,
        undefined,
        "warning",
      ),
    ];
  }

  return [];
}

export function scanCandidate(
  ctx: RuleContext,
  candidate: ClassCandidate,
  counters: ScanCounters,
): Finding[] {
  const out: Finding[] = [...checkColour(ctx, candidate, counters)];

  // A JSX colour prop or an inline style value is a bare value, not a class
  // list, so only the colour rule applies.
  if (candidate.origin === "jsx-prop" || candidate.origin === "inline-style") return out;

  for (const { utility, index } of parseClassString(candidate.text)) {
    out.push(...checkUtility(ctx, candidate, utility, index));
  }
  return out;
}
