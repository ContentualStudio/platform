/**
 * The closed billing vocabulary: three tiers and what each one entitles.
 *
 * Split deliberately from `billing.config.ts`. What a tier *is* — its key,
 * its order, what it unlocks — is a product fact that is identical in every
 * environment and belongs in code, where it can be typed and exhaustively
 * switched on. What a tier *costs* is a Stripe price id that differs per
 * environment and has to change without a deploy, so it lives in config.
 *
 * Adding, renaming or repricing a tier happens here and in that config file,
 * and nowhere else: every Billing surface resolves through these helpers.
 */

/** The programme set a tier unlocks, consumed by Matching and Programmes. */
export const programmeSets = {
  /** The starter subset a free account may choose from. */
  limited: "limited",
  /** Everything shipped in Phase 1. */
  full: "full",
} as const;

export type ProgrammeSet = (typeof programmeSets)[keyof typeof programmeSets];

export const tierKeys = {
  free: "free",
  creator: "creator",
  pro: "pro",
} as const;

export type TierKey = (typeof tierKeys)[keyof typeof tierKeys];

/** The tiers a Stripe subscription can carry. Free is the absence of one. */
export const paidTierKeys = [tierKeys.creator, tierKeys.pro] as const;

export type PaidTierKey = (typeof paidTierKeys)[number];

export interface BillingTier {
  readonly key: TierKey;
  readonly displayName: string;
  /** Ascending: the order a pricing table lists them in. */
  readonly order: number;
  /** Which programmes this tier may start. */
  readonly programmeSet: ProgrammeSet;
  /** Whether the tier grants early access to unreleased features. */
  readonly earlyAccess: boolean;
  /**
   * Analytics are available on every tier, Free included — the tiers differ
   * in depth, not in access. Stated as a field rather than assumed so a
   * surface asking "does this tier get analytics" has one place to read, and
   * so the day it stops being true is a change here rather than a hunt.
   */
  readonly analytics: boolean;
  /**
   * The growth-graph windows, in days, this tier may open. The 90-day history
   * is the one paid analytics entitlement; everything else is on every tier.
   */
  readonly analyticsWindowsDays: readonly number[];
  /** Whether Studio lessons flagged paid-only render their body on this tier. */
  readonly paidLessons: boolean;
  /**
   * Whether checking out is possible. Free has no Stripe price, which is the
   * one structural difference between the tiers rather than a missing value.
   */
  readonly checkout: boolean;
}

const TIERS: Readonly<Record<TierKey, BillingTier>> = {
  [tierKeys.free]: {
    key: tierKeys.free,
    displayName: "Free",
    order: 0,
    programmeSet: programmeSets.limited,
    earlyAccess: false,
    analytics: true,
    analyticsWindowsDays: [7, 30],
    paidLessons: false,
    checkout: false,
  },
  [tierKeys.creator]: {
    key: tierKeys.creator,
    displayName: "Creator",
    order: 1,
    programmeSet: programmeSets.full,
    earlyAccess: false,
    analytics: true,
    analyticsWindowsDays: [7, 30, 90],
    paidLessons: true,
    checkout: true,
  },
  [tierKeys.pro]: {
    key: tierKeys.pro,
    displayName: "Pro",
    order: 2,
    programmeSet: programmeSets.full,
    earlyAccess: true,
    analytics: true,
    analyticsWindowsDays: [7, 30, 90],
    paidLessons: true,
    checkout: true,
  },
};

// Frozen, not merely typed readonly: `readonly` vanishes at runtime, and this
// array is handed to every Billing surface. One caller sorting it in place
// would reorder the pricing table for everyone.
const ORDERED_TIERS: readonly BillingTier[] = Object.freeze(
  Object.values(TIERS).sort((left, right) => left.order - right.order),
);

/** Every tier, cheapest first — the order a pricing table renders. */
export function listTiers(): readonly BillingTier[] {
  return ORDERED_TIERS;
}

/** Narrows an untrusted string to a tier key, or undefined. */
export function parseTierKey(value: unknown): TierKey | undefined {
  return typeof value === "string" && value in TIERS
    ? (value as TierKey)
    : undefined;
}

/**
 * Narrows an untrusted string to a paid tier key, or undefined.
 *
 * A subscription row, a checkout request or a Stripe price mapping can only
 * ever name a paid tier; "free" arriving in any of those is a bug to refuse,
 * not a value to store.
 */
export function parsePaidTierKey(value: unknown): PaidTierKey | undefined {
  return typeof value === "string" &&
    (paidTierKeys as readonly string[]).includes(value)
    ? (value as PaidTierKey)
    : undefined;
}

/**
 * The tier a CMS-authored gate resolves to. Anything unrecognised — a blank
 * field on a programme published before the gate existed, a typo — reads as
 * Free, so drift in content can only ever open a programme up, never lock
 * every user out of it.
 */
export function tierKeyOrFree(value: unknown): TierKey {
  return parseTierKey(value) ?? tierKeys.free;
}

/**
 * Whether `actual` is at least `required` on the ordering above. This is the
 * one comparison every gate uses, so "Pro includes everything Creator does"
 * is a fact of the ordering rather than a case each gate restates.
 */
export function tierSatisfies(actual: TierKey, required: TierKey): boolean {
  return TIERS[actual].order >= TIERS[required].order;
}

/**
 * Resolves a tier by key.
 *
 * Returns undefined rather than throwing for an unknown key: the caller is
 * usually holding a value from a database row or a webhook, where an
 * unrecognised tier is a case to handle, not a crash.
 */
export function findTier(key: unknown): BillingTier | undefined {
  const parsed = parseTierKey(key);

  return parsed ? TIERS[parsed] : undefined;
}

/** Resolves a tier known to exist, for a key already narrowed to TierKey. */
export function tier(key: TierKey): BillingTier {
  return TIERS[key];
}

/** The tier an account falls back to with no paid subscription. */
export function defaultTier(): BillingTier {
  return TIERS[tierKeys.free];
}
