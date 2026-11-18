import { readFileSync } from "node:fs";

/**
 * The allowlist is the one escape hatch, and it is deliberately hard to abuse.
 *
 * Two properties stop it degrading into a baseline file:
 *   1. `reason` is mandatory and must be a real sentence (>= 20 chars).
 *   2. An entry that no longer matches anything is a hard error — dead
 *      exceptions must be deleted, not left to accumulate.
 *
 * Entries match on (file, rule, exact value), never on line number, so
 * ordinary edits do not churn them.
 */

export interface ColorRelations {
  /** Groups of tokens intended to be the same colour in a given theme. */
  aliases: string[][];
  /** Pairs designed to sit next to each other and differ subtly. */
  adjacent: string[][];
  /**
   * Tokens that hold one value in both themes because the surface they paint
   * never follows the theme. They are not part of the light palette in any
   * meaningful sense, so comparing them against it produces findings about
   * colours that can never appear together.
   */
  themeInvariant: string[];
}

export interface AllowlistEntry {
  file: string;
  rule: string;
  values: string[];
  reason: string;
}

export interface Allowlist {
  colorRelations: ColorRelations;
  exceptions: AllowlistEntry[];
}

const MIN_REASON_LENGTH = 20;

export class AllowlistError extends Error {}

export function parseAllowlist(json: string, path: string): Allowlist {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new AllowlistError(
      `${path} is not valid JSON: ${(error as Error).message}`,
    );
  }

  const data = raw as Partial<Allowlist>;
  const exceptions = data.exceptions ?? [];

  exceptions.forEach((entry, index) => {
    const at = `${path} exceptions[${index}]`;
    if (!entry.file) throw new AllowlistError(`${at} is missing "file".`);
    if (!entry.rule) throw new AllowlistError(`${at} is missing "rule".`);
    if (!Array.isArray(entry.values) || entry.values.length === 0) {
      throw new AllowlistError(`${at} must list at least one value.`);
    }
    if (!entry.reason || entry.reason.trim().length < MIN_REASON_LENGTH) {
      throw new AllowlistError(
        `${at} needs a "reason" of at least ${MIN_REASON_LENGTH} characters ` +
          `explaining why this exception is correct. Got: ${JSON.stringify(entry.reason ?? "")}`,
      );
    }
  });

  return {
    colorRelations: {
      aliases: data.colorRelations?.aliases ?? [],
      adjacent: data.colorRelations?.adjacent ?? [],
      themeInvariant: data.colorRelations?.themeInvariant ?? [],
    },
    exceptions,
  };
}

export function loadAllowlist(path: string): Allowlist {
  return parseAllowlist(readFileSync(path, "utf8"), path);
}

/** Tracks which entries were used, so stale ones can be reported. */
export class AllowlistMatcher {
  private readonly used = new Set<AllowlistEntry>();

  constructor(private readonly allowlist: Allowlist) {}

  allows(file: string, rule: string, value: string): boolean {
    for (const entry of this.allowlist.exceptions) {
      if (entry.rule !== rule) continue;
      if (!file.endsWith(entry.file)) continue;
      if (!entry.values.includes(value)) continue;
      this.used.add(entry);
      return true;
    }
    return false;
  }

  /** Entries that matched nothing this run. These are errors, not warnings. */
  stale(): AllowlistEntry[] {
    return this.allowlist.exceptions.filter((entry) => !this.used.has(entry));
  }
}

/** Normalises a token name to its --ds-* form for relation lookups. */
function normalise(name: string): string {
  return name.startsWith("--") ? name : `--ds-${name}`;
}

export function isThemeInvariant(relations: ColorRelations, name: string): boolean {
  const target = normalise(name);
  return relations.themeInvariant.map(normalise).includes(target);
}

export function isDeclaredAlias(
  relations: ColorRelations,
  a: string,
  b: string,
): boolean {
  const [x, y] = [normalise(a), normalise(b)];
  return relations.aliases.some((group) => {
    const members = group.map(normalise);
    return members.includes(x) && members.includes(y);
  });
}

/**
 * Every token declared as the same colour as this one, including itself.
 *
 * Adjacency propagates through alias groups: if --ds-accent-on is declared
 * identical to --ds-bg, and --ds-bg is declared adjacent to --ds-surface, then
 * accent-on is adjacent to surface too. Without this, an alias group forces
 * you to restate the same relationship once per member — busywork that makes
 * the declarations less readable, not more precise.
 */
function aliasClass(relations: ColorRelations, name: string): string[] {
  const target = normalise(name);
  const out = new Set([target]);
  for (const group of relations.aliases) {
    const members = group.map(normalise);
    if (members.includes(target)) for (const member of members) out.add(member);
  }
  return [...out];
}

export function isDeclaredAdjacent(
  relations: ColorRelations,
  a: string,
  b: string,
): boolean {
  const xs = aliasClass(relations, a);
  const ys = aliasClass(relations, b);

  return relations.adjacent.some((pair) => {
    const [p, q] = pair.map(normalise);
    if (p === undefined || q === undefined) return false;
    return (
      (xs.includes(p) && ys.includes(q)) || (xs.includes(q) && ys.includes(p))
    );
  });
}
