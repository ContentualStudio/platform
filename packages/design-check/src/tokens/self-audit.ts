import {
  isDeclaredAdjacent,
  isDeclaredAlias,
  isThemeInvariant,
  type ColorRelations,
} from "../allowlist.js";
import { deltaE00, rgbToLab } from "../color/ciede2000.js";
import { CSS_COLOR_RE, formatHex, parseColor } from "../color/parse.js";
import { nextId, type Finding } from "../report/findings.js";
import {
  ALLOWED_THEME_LITERALS,
  referencedDsVars,
  refOf,
} from "./parse-globals.js";
import { toPx, type Theme, type TokenSet } from "./token-set.js";

/**
 * Audits the design system against itself.
 *
 * These rules run before anything looks at web/src, because a call-site check
 * against an incoherent token set produces confident nonsense — you cannot
 * tell someone "use --color-muted-foreground" while that token is a duplicate
 * of --color-muted.
 */

/**
 * ΔE00 thresholds, chosen against this palette rather than from a blog post.
 *
 * The naive "under 2 is a duplicate" rule is wrong here: --ds-bg vs
 * --ds-surface (page vs card) sits at ΔE00 2.01 and is the single most
 * load-bearing pair in the system. A blanket threshold would fail the design
 * system on its own foundation. Hence the split below.
 */
export const JND_SEPARATED = 2.3;
/** Two hard-edged patches side by side are distinguishable from about 1.0. */
export const JND_ADJACENT = 1.0;

const CSS_FILE = "web/src/app/globals.css";

function finding(
  rule: string,
  ruleTitle: string,
  message: string,
  offending: string,
  line: number,
  expected?: string,
): Finding {
  return {
    id: nextId("sys"),
    source: "static",
    severity: "error",
    rule,
    ruleTitle,
    message,
    offending,
    expected,
    file: CSS_FILE,
    line,
  };
}

/**
 * The --ds-* name a @theme inline entry should point at.
 *
 * Colours drop their namespace (--color-accent → --ds-accent) but radii and
 * shadows keep theirs (--radius-md → --ds-radius-md), matching how the palette
 * is already named.
 */
export function suggestedDsName(prop: string): string {
  const colour = /^--color-(.+)$/.exec(prop);
  if (colour) return `var(--ds-${colour[1]})`;
  return `var(--ds-${prop.slice("--".length)})`;
}

/** S1 — @theme inline must map to --ds-*, not restate literals. */
function auditThemeLiterals(tokens: TokenSet): Finding[] {
  const out: Finding[] = [];

  for (const [prop, decl] of tokens.theme) {
    const isDesignValue =
      prop.startsWith("--color-") ||
      prop.startsWith("--radius-") ||
      prop.startsWith("--shadow-");
    if (!isDesignValue) continue;
    if (refOf(decl.value)) continue;
    if (ALLOWED_THEME_LITERALS.has(decl.value.trim())) continue;

    out.push(
      finding(
        "S1",
        "A design value is hardcoded instead of using a token",
        `${prop} is set to the literal value "${decl.value}" instead of pointing at a ` +
          `--ds-* token. Changing the design system will not change this value, so it ` +
          `will drift out of step with everything else.`,
        decl.value,
        decl.line,
        suggestedDsName(prop),
      ),
    );
  }

  return out;
}

/**
 * S2 — a foreground token resolving to the same colour as the surface it sits
 * on.
 *
 * Note what this rule deliberately does *not* flag. Several `--color-*` names
 * pointing at one `--ds-*` token is the entire point of a semantic alias layer
 * — `--color-foreground`, `--color-primary` and `--color-card-foreground` all
 * resolving to `--ds-fg` is correct, not drift. The genuine defect is narrower:
 * an `X` / `X-foreground` pair that resolves to the same colour, which means
 * text painted onto its own background.
 */
function auditForegroundPairs(
  tokens: TokenSet,
  relations: ColorRelations,
): Finding[] {
  const out: Finding[] = [];

  for (const [prop, decl] of tokens.theme) {
    if (!prop.startsWith("--color-") || !prop.endsWith("-foreground")) continue;

    const base = prop.slice(0, -"-foreground".length);
    const baseDecl = tokens.theme.get(base);
    if (!baseDecl) continue;

    const fgRef = refOf(decl.value);
    const bgRef = refOf(baseDecl.value);
    if (!fgRef || !bgRef || fgRef !== bgRef) continue;
    if (isDeclaredAlias(relations, fgRef, bgRef)) continue;

    out.push(
      finding(
        "S2",
        "Text and its background are the same colour",
        `${prop} and ${base} both resolve to ${fgRef}. A foreground token and the ` +
          `surface it is painted on cannot be the same colour — text using this pair ` +
          `is invisible, or the pair is misnamed.`,
        fgRef,
        decl.line,
      ),
    );
  }
  return out;
}

/** S3 — a --radius-* literal colliding by name with a differently-valued --ds-radius-*. */
function auditRadiusNameCollisions(tokens: TokenSet): Finding[] {
  const out: Finding[] = [];

  for (const radius of tokens.radii) {
    const dsName = `--ds-radius-${radius.name}`;
    const ds = tokens.ds.light.get(dsName);
    if (!ds) continue;

    const dsPx = toPx(ds.value);
    if (dsPx === null || dsPx === radius.px) continue;

    out.push(
      finding(
        "S3",
        "Two radius tokens share a name but not a value",
        `--radius-${radius.name} is ${radius.px}px but ${dsName} is ${dsPx}px. ` +
          `Two things with the same name and different values is a trap — whoever reads ` +
          `one will assume the other.`,
        `${radius.px}px`,
        radius.line,
        `${dsPx}px`,
      ),
    );
  }
  return out;
}

/** S4 — numeric tokens must be integral, and spacing on the base lattice. */
function auditNumericHygiene(tokens: TokenSet): Finding[] {
  const out: Finding[] = [];

  for (const [prop, decl] of tokens.ds.light) {
    const px = toPx(decl.value);
    if (px === null) continue;

    if (!Number.isInteger(px)) {
      out.push(
        finding(
          "S4",
          "A token has a fractional pixel value",
          `${prop} is ${decl.value}. Fractional pixels come from exporting a design ` +
            `tool's raw measurement rather than deciding a value. Round it.`,
          decl.value,
          decl.line,
          `${Math.round(px)}px`,
        ),
      );
    }

    /*
     * Guards against a --ds-space-* block being reintroduced off-lattice. The
     * current globals.css has none — the block was deleted precisely because
     * being a second, unmapped source of truth is how --ds-space-14 came to be
     * 60px when step 14 is 56px — so this fires only on a regression. That is
     * the point of it.
     */
    if (prop.startsWith("--ds-space-")) {
      const step = Number(prop.slice("--ds-space-".length));
      const expected = step * tokens.spacingBasePx;
      if (Number.isFinite(step) && px !== expected) {
        out.push(
          finding(
            "S4",
            "A spacing token is off the spacing scale",
            `${prop} is ${px}px, but step ${step} on a ${tokens.spacingBasePx}px scale ` +
              `is ${expected}px. The name promises a position on the scale that the value ` +
              `does not deliver.`,
            `${px}px`,
            decl.line,
            `${expected}px`,
          ),
        );
      }
    }
  }
  return out;
}

/**
 * S5 — --ds-* tokens nothing references.
 *
 * `referenced` must include call sites, not just globals.css. Scanning the
 * stylesheet alone produced directly contradictory advice: S5 said to delete
 * --ds-accent-gradient while the call-site rules reported a component using it
 * through `bg-[var(--ds-accent-gradient)]`. Following the first breaks the
 * second.
 */
function auditDeadTokens(
  tokens: TokenSet,
  css: string,
  externalRefs: ReadonlySet<string>,
): Finding[] {
  const referenced = referencedDsVars(css);
  for (const ref of externalRefs) referenced.add(ref);
  const out: Finding[] = [];

  for (const [prop, decl] of tokens.ds.light) {
    if (!prop.startsWith("--ds-")) continue;
    if (referenced.has(prop)) continue;

    out.push({
      ...finding(
        "S5",
        "A token is defined but never used",
        `${prop} is declared but nothing references it. It is not part of the design ` +
          `system in any meaningful sense — either wire it up or delete it.`,
        prop,
        decl.line,
      ),
      severity: "warning",
    });
  }
  return out;
}

interface PaletteEntry {
  name: string;
  hex: string;
  lab: ReturnType<typeof rgbToLab>;
  line: number;
}

/**
 * The palette S6 compares: the `--ds-*` colours themselves, resolved per
 * theme.
 *
 * Comparing the `--color-*` alias layer instead would be a category error —
 * that layer maps many names onto the same handful of colours by design, so
 * every comparison would be against a duplicate of something else and the
 * output would be quadratic noise. The palette is what a designer picked; the
 * alias layer is how it gets used.
 */
function paletteFor(
  tokens: TokenSet,
  theme: Theme,
  relations: ColorRelations,
): PaletteEntry[] {
  const source = theme === "light" ? tokens.ds.light : tokens.ds.dark;
  const out: PaletteEntry[] = [];

  for (const [prop, decl] of source) {
    if (!prop.startsWith("--ds-")) continue;
    // A theme-invariant token paints a surface that never follows the theme,
    // so it belongs to exactly one palette. Comparing it against the other
    // reports collisions between colours that can never meet on screen.
    if (theme === "light" && isThemeInvariant(relations, prop)) continue;
    // Translucent overlays (focus rings, selection) are derived from a palette
    // colour and carry its hue by design. Comparing them against their own
    // base would report every one of them as a duplicate of the thing it is
    // meant to be made of.
    if (hasAlpha(decl.value)) continue;
    const rgb = parseColor(decl.value);
    if (!rgb) continue;
    out.push({ name: prop, hex: formatHex(rgb), lab: rgbToLab(rgb), line: decl.line });
  }
  return out;
}

/** True for any colour notation carrying an alpha channel. */
export function hasAlpha(value: string): boolean {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{4}$/.test(v) || /^#[0-9a-fA-F]{8}$/.test(v)) return true;
  if (/^rgba?\s*\([^)]*\//.test(v) || /^hsla?\s*\([^)]*\//.test(v)) return true;
  // Comma syntax with a fourth argument.
  const fn = /^(?:rgba?|hsla?)\s*\(([^)]*)\)$/.exec(v);
  return fn ? fn[1]!.split(",").length === 4 : false;
}

/** S6 — colour near-duplicates. The role-aware three-part rule. */
function auditColorDistances(
  tokens: TokenSet,
  relations: ColorRelations,
): Finding[] {
  const out: Finding[] = [];

  for (const theme of ["light", "dark"] as const) {
    const palette = paletteFor(tokens, theme, relations);

    for (let i = 0; i < palette.length; i += 1) {
      for (let j = i + 1; j < palette.length; j += 1) {
        const a = palette[i]!;
        const b = palette[j]!;

        const distance = deltaE00(a.lab, b.lab);
        const rounded = distance.toFixed(2);
        const pair = `${a.name} (${a.hex}) and ${b.name} (${b.hex})`;

        if (distance === 0) {
          // S6a — identical across two roles.
          if (isDeclaredAlias(relations, a.name, b.name)) continue;
          out.push(
            finding(
              "S6a",
              "Two colours are exactly the same",
              `In ${theme} mode, ${pair} are the same colour. Two tokens that are ` +
                `always identical are one token wearing two names — pick one, or make ` +
                `them actually differ.`,
              a.hex,
              a.line,
            ),
          );
          continue;
        }

        if (isDeclaredAdjacent(relations, a.name, b.name)) {
          // S6c — declared adjacent, but must still be told apart.
          if (distance < JND_ADJACENT) {
            out.push(
              finding(
                "S6c",
                "Two colours meant to be distinguishable are too close",
                `In ${theme} mode, ${pair} differ by only ΔE00 ${rounded}. These two are ` +
                  `declared as a pair that sits side by side, so the difference has to be ` +
                  `visible — below about ${JND_ADJACENT} it is not.`,
                `ΔE00 ${rounded}`,
                a.line,
              ),
            );
          }
          continue;
        }

        // S6b — undeclared near-duplicate.
        if (distance < JND_SEPARATED) {
          out.push(
            finding(
              "S6b",
              "Two colours are too similar to tell apart",
              `In ${theme} mode, ${pair} differ by ΔE00 ${rounded}, below the ` +
                `${JND_SEPARATED} threshold at which two separated elements read as the ` +
                `same colour. Nobody can see the difference, so keeping both invites ` +
                `them to drift apart.`,
              `ΔE00 ${rounded}`,
              a.line,
            ),
          );
        }
      }
    }
  }
  return out;
}

/** S7 — a light colour with no dark-mode decision. */
function auditThemeCoverage(tokens: TokenSet, relations: ColorRelations): Finding[] {
  const out: Finding[] = [];

  for (const [prop, lightDecl] of tokens.ds.light) {
    if (!parseColor(lightDecl.value)) continue;
    // Holding one value in both themes is the whole point of these, and it is
    // already declared. Asking for a dark-mode override would contradict the
    // declaration and can never be satisfied, which is how a check ends up
    // permanently dirty and then ignored.
    if (isThemeInvariant(relations, prop)) continue;
    const darkDecl = tokens.ds.dark.get(prop);
    // Inherited rather than overridden: dark and light hold the same RawDecl.
    if (darkDecl !== lightDecl) continue;

    out.push({
      ...finding(
        "S7",
        "A colour has no dark-mode value",
        `${prop} is defined for light mode but never given a dark-mode value, so it ` +
          `keeps its light value on a dark background. If that is deliberate, say so ` +
          `by restating it in the dark block.`,
        lightDecl.value,
        lightDecl.line,
      ),
      severity: "warning",
    });
  }
  return out;
}

/** Hardcoded colours in element rules and layers, outside the token blocks. */
function auditHardcodedLiterals(tokens: TokenSet): Finding[] {
  const out: Finding[] = [];

  for (const decl of tokens.otherDecls) {
    if (!CSS_COLOR_RE.test(decl.value)) continue;
    out.push(
      finding(
        "S1",
        "A design value is hardcoded instead of using a token",
        `"${decl.prop}: ${decl.value}" writes a colour directly rather than using a ` +
          `token. This one will not follow the theme and will not change when the ` +
          `design system does.`,
        decl.value,
        decl.line,
      ),
    );
  }
  return out;
}

export function auditDesignSystem(
  tokens: TokenSet,
  css: string,
  relations: ColorRelations,
  /** --ds-* names referenced from outside the stylesheet, for the S5 rule. */
  externalRefs: ReadonlySet<string> = new Set(),
): Finding[] {
  return [
    ...auditThemeLiterals(tokens),
    ...auditForegroundPairs(tokens, relations),
    ...auditRadiusNameCollisions(tokens),
    ...auditNumericHygiene(tokens),
    ...auditDeadTokens(tokens, css, externalRefs),
    ...auditColorDistances(tokens, relations),
    ...auditThemeCoverage(tokens, relations),
    ...auditHardcodedLiterals(tokens),
  ].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}
