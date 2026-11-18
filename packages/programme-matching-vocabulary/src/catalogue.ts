import { z } from "zod";

// The one vocabulary the web questionnaire, the API matcher and the CMS rule
// editor all read. Every token an author can select, and every token a profile
// can carry, is declared here exactly once: a rule that references anything
// outside this file is unpublishable by construction, which is what stops a
// programme's audience being described in terms users cannot actually answer.
//
// Deliberately absent: `name`, `region`, `timezone`, `availableDays`,
// `sawTestimonial` and `milestone`. The first four are scheduling or identity
// data, and `milestone` is free text — the specification puts free text out of
// reach of initial matching, so it is not merely unused here, it is unnameable.

export const userTypes = [
  "Independent Creator",
  "Business Owner",
  "Marketing Manager",
] as const;

// The union of what Stage 1 and Stage 2 offer. Stage 1 historically wrote
// "X / Twitter" and Stage 2 "X (Twitter)"; the parenthesised spelling is
// canonical and `canonicalPlatform` below is the only sanctioned way to reach
// it, so no consumer has to know which stage a value came from.
export const platforms = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "X (Twitter)",
  "Facebook",
  "Pinterest",
  "Other",
] as const;

export const experienceLevels = [
  "Just getting started (0–3 months)",
  "Consistent beginner (3–6 months)",
  "Intermediate (6–18 months)",
  "Experienced (2+ years)",
  "On-and-off",
] as const;

// What the user does today (Stage 1). Kept distinct from `postingGoals` below:
// the specification treats current cadence as the matching signal and desired
// cadence as primarily a scheduling one, so collapsing them would silently
// change who matches what.
export const postingFrequencies = [
  "Daily",
  "A few times a week",
  "Weekly",
  "A few times a month",
  "Rarely",
] as const;

// What the user intends to do (Stage 2).
export const postingGoals = [
  "Daily",
  "5 times per week",
  "3–4 times per week",
  "1–2 times per week",
  "Just getting started",
] as const;

export const mainGoals = [
  "Grow my audience",
  "Be more consistent",
  "Improve my content",
  "Increase engagement",
  "Build my business",
] as const;

export const biggestChallenges = [
  "Staying consistent",
  "Running out of ideas",
  "Finding time",
  "Editing content",
  "Growing an audience",
] as const;

export const nicheStatuses = ["Yes", "Partially", "Not yet"] as const;

export const contentTypes = [
  "Educational",
  "Entertainment",
  "Lifestyle",
  "Business",
  "Personal Brand",
  "Product Reviews",
  "Tutorials",
  "Vlogs",
  "Other",
] as const;

export const followerRanges = [
  "0–100",
  "101–500",
  "501–1,000",
  "1,001–5,000",
  "5,001–10,000",
  "10,000+",
] as const;

// A derived, closed reading of "has the user linked an account". Stored as a
// boolean today; naming both states makes the rule read as a question an
// operator recognises rather than as `instagramConnected = true`.
export const platformConnectionStatuses = ["connected", "not_connected"] as const;

// ── Comparison orderings ──
//
// `gte` on a cadence field must mean "posts at least this often", so the
// tuples below run from least to most, which is the reverse of how the
// questionnaire lists them. Follower ranges already read smallest-first.
export const postingFrequenciesAscending = [
  "Rarely",
  "A few times a month",
  "Weekly",
  "A few times a week",
  "Daily",
] as const;

export const postingGoalsAscending = [
  "Just getting started",
  "1–2 times per week",
  "3–4 times per week",
  "5 times per week",
  "Daily",
] as const;

export const followerRangesAscending = followerRanges;

// An ordering that omitted or invented an option would rank real answers
// against nothing, so both directions of the difference are asserted: a
// missing option and an invented one are each a compile error here rather
// than a rule that silently never matches.
type SameMembers<
  A extends readonly string[],
  B extends readonly string[],
> = Exclude<A[number], B[number]> | Exclude<B[number], A[number]>;

// `followerRangesAscending` is `followerRanges` itself, so it needs no check —
// only the two tuples that are genuinely written out twice do.
const everyOrderingIsComplete: [
  SameMembers<typeof postingFrequencies, typeof postingFrequenciesAscending>,
  SameMembers<typeof postingGoals, typeof postingGoalsAscending>,
] extends never[]
  ? true
  : never = true;
void everyOrderingIsComplete;

export const matchingFields = [
  "userType",
  "selectedPlatforms",
  "primaryPlatform",
  "experienceLevel",
  "currentPostingFrequency",
  "mainGoal",
  "biggestChallenge",
  "desiredPostingFrequency",
  "weeklyCommitment",
  "nicheDefined",
  "preferredContentType",
  "followerRange",
  "platformConnectionStatus",
] as const;

export const matchingOperators = [
  "equals",
  "one_of",
  "gte",
  "lte",
  "contains_any",
  "contains_all",
  "contains_none",
] as const;

// Named handles for the closed tuples, so a switch case or a test fixture can
// name one token without restating the literal. Tuple position is not a
// contract; these names are.
export const matchingFieldTokens = {
  userType: "userType",
  selectedPlatforms: "selectedPlatforms",
  primaryPlatform: "primaryPlatform",
  experienceLevel: "experienceLevel",
  currentPostingFrequency: "currentPostingFrequency",
  mainGoal: "mainGoal",
  biggestChallenge: "biggestChallenge",
  desiredPostingFrequency: "desiredPostingFrequency",
  weeklyCommitment: "weeklyCommitment",
  nicheDefined: "nicheDefined",
  preferredContentType: "preferredContentType",
  followerRange: "followerRange",
  platformConnectionStatus: "platformConnectionStatus",
} as const satisfies Record<string, (typeof matchingFields)[number]>;

export const matchingOperatorTokens = {
  equals: "equals",
  oneOf: "one_of",
  gte: "gte",
  lte: "lte",
  containsAny: "contains_any",
  containsAll: "contains_all",
  containsNone: "contains_none",
} as const satisfies Record<string, (typeof matchingOperators)[number]>;

export const platformConnectionStatusTokens = {
  connected: "connected",
  notConnected: "not_connected",
} as const satisfies Record<
  string,
  (typeof platformConnectionStatuses)[number]
>;

type Unnamed<
  Tuple extends readonly string[],
  Tokens extends Record<string, string>,
> = Exclude<Tuple[number], Tokens[keyof Tokens]>;

// `satisfies` constrains the values but not the key set, so on its own it would
// let a newly added token go unnamed. This makes that a compile error.
const everyTokenIsNamed: [
  Unnamed<typeof matchingFields, typeof matchingFieldTokens>,
  Unnamed<typeof matchingOperators, typeof matchingOperatorTokens>,
  Unnamed<
    typeof platformConnectionStatuses,
    typeof platformConnectionStatusTokens
  >,
] extends never[]
  ? true
  : never = true;
void everyTokenIsNamed;

export const matchingFieldSchema = z.enum(matchingFields);
export const matchingOperatorSchema = z.enum(matchingOperators);
export const platformSchema = z.enum(platforms);

export type MatchingField = z.infer<typeof matchingFieldSchema>;
export type MatchingOperator = z.infer<typeof matchingOperatorSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type PlatformConnectionStatus =
  (typeof platformConnectionStatuses)[number];

// How a field is compared, not what it is called.
//
// `ordered_enum` exists because "at least Intermediate" is a rule operators
// genuinely want, and the only honest ordering of an answer list is the order
// the questionnaire presents it in. `experienceLevel` is the exception: its
// last option ("On-and-off") is a shape, not a rung, so that field is
// unordered and `gte`/`lte` are refused on it rather than silently ranking it.
export type MatchingFieldKind =
  | "enum"
  | "ordered_enum"
  | "multi_enum"
  | "integer";

export interface MatchingFieldDefinition {
  readonly kind: MatchingFieldKind;
  readonly label: string;
  // Absent for `integer` fields, which are bounded by `min`/`max` instead.
  readonly values?: readonly string[];
  // Ascending magnitude, required for and only for `ordered_enum`. Written out
  // separately from `values` because the questionnaire's presentation order is
  // not the comparison order — "Daily" is offered first but ranks highest —
  // and inferring one from the other would make `gte` mean the opposite of
  // what an author reads.
  readonly ascending?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  // False when the profile may legitimately have no answer. Rules against an
  // optional field still fail closed when the answer is missing; the flag only
  // tells the authoring UI which conditions can never match some users.
  readonly alwaysPresent: boolean;
}

export const matchingFieldCatalogue = {
  userType: {
    kind: "enum",
    label: "User type",
    values: userTypes,
    alwaysPresent: true,
  },
  selectedPlatforms: {
    kind: "multi_enum",
    label: "Selected platforms",
    values: platforms,
    alwaysPresent: true,
  },
  primaryPlatform: {
    kind: "enum",
    label: "Primary platform",
    values: platforms,
    // A single-platform selection implies its own primary, but a legacy
    // two-platform row may have none until it is backfilled.
    alwaysPresent: false,
  },
  experienceLevel: {
    kind: "enum",
    label: "Experience level",
    values: experienceLevels,
    alwaysPresent: true,
  },
  currentPostingFrequency: {
    kind: "ordered_enum",
    label: "Current posting frequency",
    values: postingFrequencies,
    ascending: postingFrequenciesAscending,
    alwaysPresent: true,
  },
  mainGoal: {
    kind: "enum",
    label: "Main goal",
    values: mainGoals,
    alwaysPresent: true,
  },
  biggestChallenge: {
    kind: "enum",
    label: "Biggest challenge",
    values: biggestChallenges,
    alwaysPresent: true,
  },
  desiredPostingFrequency: {
    kind: "ordered_enum",
    label: "Desired posting frequency",
    values: postingGoals,
    ascending: postingGoalsAscending,
    alwaysPresent: true,
  },
  weeklyCommitment: {
    kind: "integer",
    label: "Weekly commitment (days)",
    min: 1,
    max: 7,
    alwaysPresent: true,
  },
  nicheDefined: {
    kind: "enum",
    label: "Niche defined",
    values: nicheStatuses,
    alwaysPresent: true,
  },
  preferredContentType: {
    kind: "enum",
    label: "Preferred content type",
    values: contentTypes,
    alwaysPresent: true,
  },
  followerRange: {
    kind: "ordered_enum",
    label: "Follower range",
    values: followerRanges,
    ascending: followerRangesAscending,
    alwaysPresent: true,
  },
  platformConnectionStatus: {
    kind: "enum",
    label: "Platform connection status",
    values: platformConnectionStatuses,
    alwaysPresent: true,
  },
} as const satisfies Record<MatchingField, MatchingFieldDefinition>;

// Which comparisons each kind of field admits. Ordering is what separates the
// two enum kinds: `gte`/`lte` are meaningless without it, and offering them
// anyway would let an author write a rule whose result depends on the order
// someone happened to type the options in.
export const operatorsByFieldKind = {
  enum: ["equals", "one_of"],
  ordered_enum: ["equals", "one_of", "gte", "lte"],
  multi_enum: ["contains_any", "contains_all", "contains_none"],
  integer: ["equals", "one_of", "gte", "lte"],
} as const satisfies Record<MatchingFieldKind, readonly MatchingOperator[]>;

// How many accepted values a comparison takes. `single` operators reject a
// second value rather than quietly using the first, because "equals A or B" is
// a real rule an author must express as `one_of` and see in the editor.
export const operatorCardinality = {
  equals: "single",
  one_of: "list",
  gte: "single",
  lte: "single",
  contains_any: "list",
  contains_all: "list",
  contains_none: "list",
} as const satisfies Record<MatchingOperator, "single" | "list">;

// Widened to the interface on the way out. Inside the literal each field has
// its own exact shape, which is what makes the `satisfies` check meaningful;
// callers need the common shape, and reading `values` off the union directly
// would not compile for the integer field.
export function fieldDefinition(field: MatchingField): MatchingFieldDefinition {
  return matchingFieldCatalogue[field];
}

export function operatorsFor(
  field: MatchingField,
): readonly MatchingOperator[] {
  return operatorsByFieldKind[fieldDefinition(field).kind];
}

// Accepted values an author may choose for a field. `integer` fields have no
// closed list, so the caller renders `min`/`max` instead — an empty array here
// means "not a pick-list", never "no valid answers".
export function acceptedValuesFor(field: MatchingField): readonly string[] {
  return fieldDefinition(field).values ?? [];
}

// The single sanctioned bridge from a stored answer to a catalogue token.
// Stage 1's "X / Twitter" is the only historical divergence; anything else is
// either already canonical or genuinely unknown, and unknown must stay
// `null` so a rule fails closed rather than matching a value nobody selected.
const platformAliases: Record<string, Platform> = {
  "X / Twitter": "X (Twitter)",
};

export function canonicalPlatform(value: unknown): Platform | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const aliased = platformAliases[trimmed];

  if (aliased) {
    return aliased;
  }

  return (platforms as readonly string[]).includes(trimmed)
    ? (trimmed as Platform)
    : null;
}
