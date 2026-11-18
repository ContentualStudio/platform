import { z } from "zod";

export const eventNames = [
  "task.completed",
  "task.skipped",
  "programme.started",
  "programme.completed",
  "programme.count_reached",
  "streak.reached",
  "streak.broken",
  "streak.resumed",
  "week.completed",
  "level.changed",
  "platform.connected",
  "follower.milestone",
  "subscription.started",
  "subscription.changed",
  "subscription.ended",
] as const;

export const operators = ["eq", "neq", "in", "gte", "lte"] as const;
export const conditionSources = ["event", "user"] as const;
export const effectTypes = [
  "suggest_programme",
  "unlock_programme",
  "prompt_call",
  "award_badge",
  "in-app-message",
  "grant_call",
] as const;

export const dedupeScopes = [
  "once_per_user",
  "once_per_user_per_programme",
  "every_time",
] as const;
export const userAttributeNames = [
  "subscription_status",
  "subscription_tier",
  "user_type",
  "experience_level",
  "is_founding_creator",
  "lifetime_task_completions",
  "programmes_completed",
] as const;
export const levelNames = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Champion",
] as const;

// Named handles for the closed tuples. Consumers must never write these tokens
// as string literals (the ownership check forbids it), so they need a way to
// refer to an individual token — a switch case, a lookup key, a test fixture —
// without restating it. Position in the tuples is not a stable contract; these
// names are.
export const dedupeScopeTokens = {
  oncePerUser: "once_per_user",
  oncePerUserPerProgramme: "once_per_user_per_programme",
  everyTime: "every_time",
} as const satisfies Record<string, (typeof dedupeScopes)[number]>;

export const levelNameTokens = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  champion: "Champion",
} as const satisfies Record<string, (typeof levelNames)[number]>;

export const eventNameTokens = {
  taskCompleted: "task.completed",
  taskSkipped: "task.skipped",
  programmeStarted: "programme.started",
  programmeCompleted: "programme.completed",
  programmeCountReached: "programme.count_reached",
  streakReached: "streak.reached",
  streakBroken: "streak.broken",
  streakResumed: "streak.resumed",
  weekCompleted: "week.completed",
  levelChanged: "level.changed",
  platformConnected: "platform.connected",
  followerMilestone: "follower.milestone",
  subscriptionStarted: "subscription.started",
  subscriptionChanged: "subscription.changed",
  subscriptionEnded: "subscription.ended",
} as const satisfies Record<string, (typeof eventNames)[number]>;

export const operatorTokens = {
  eq: "eq",
  neq: "neq",
  in: "in",
  gte: "gte",
  lte: "lte",
} as const satisfies Record<string, (typeof operators)[number]>;

export const effectTypeTokens = {
  suggestProgramme: "suggest_programme",
  unlockProgramme: "unlock_programme",
  promptCall: "prompt_call",
  awardBadge: "award_badge",
  inAppMessage: "in-app-message",
  grantCall: "grant_call",
} as const satisfies Record<string, (typeof effectTypes)[number]>;

export const conditionSourceTokens = {
  event: "event",
  user: "user",
} as const satisfies Record<string, (typeof conditionSources)[number]>;

// `satisfies` constrains the values but not the key set, so on its own it would
// let a newly added token go unnamed — and consumers cannot fall back to a
// literal. These make the coverage a compile error rather than a runtime one.
type Unnamed<
  Tuple extends readonly string[],
  Tokens extends Record<string, string>,
> = Exclude<Tuple[number], Tokens[keyof Tokens]>;

const everyTokenIsNamed: [
  Unnamed<typeof dedupeScopes, typeof dedupeScopeTokens>,
  Unnamed<typeof eventNames, typeof eventNameTokens>,
  Unnamed<typeof operators, typeof operatorTokens>,
  Unnamed<typeof effectTypes, typeof effectTypeTokens>,
  Unnamed<typeof conditionSources, typeof conditionSourceTokens>,
  Unnamed<typeof levelNames, typeof levelNameTokens>,
] extends never[]
  ? true
  : never = true;
void everyTokenIsNamed;

export const eventNameSchema = z.enum(eventNames);
export const operatorSchema = z.enum(operators);
export const conditionSourceSchema = z.enum(conditionSources);
export const effectTypeSchema = z.enum(effectTypes);
export const dedupeScopeSchema = z.enum(dedupeScopes);
export const userAttributeNameSchema = z.enum(userAttributeNames);
export const levelNameSchema = z.enum(levelNames);

export type EventName = z.infer<typeof eventNameSchema>;
export type Operator = z.infer<typeof operatorSchema>;
export type ConditionSource = z.infer<typeof conditionSourceSchema>;
export type EffectType = z.infer<typeof effectTypeSchema>;
export type DedupeScope = z.infer<typeof dedupeScopeSchema>;
export type UserAttributeName = z.infer<typeof userAttributeNameSchema>;
export type LevelName = z.infer<typeof levelNameSchema>;
export type FieldType = "string" | "number" | "boolean";

export const followerMilestoneTiers = [100, 1_000, 10_000] as const;
export type FollowerMilestoneTier = (typeof followerMilestoneTiers)[number];

export interface FieldDefinition {
  readonly type: FieldType;
}

const requiredId = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
// The immutable programme version the journey is pinned to. Optional because a
// journey started outside matching may have none. Carried for traceability,
// not offered as a rule field, so it is absent from `eventFields`.
const programmeVersionId = requiredId.optional();
const positiveInteger = z.number().int().positive();

// Built from `followerMilestoneTiers` rather than restating the three
// literals, so consumers (and this schema) share one source for the tier set.
const followerMilestoneTierSchema = z.union(
  followerMilestoneTiers.map((tier) => z.literal(tier)),
) as z.ZodType<FollowerMilestoneTier>;

export const eventPayloadSchemas = {
  "task.completed": z
    .object({
      userId: requiredId,
      programmeId: requiredId,
      taskId: requiredId,
      contentType: requiredId,
      programmeVersionId,
    })
    .strict(),
  "task.skipped": z
    .object({
      userId: requiredId,
      programmeId: requiredId,
      taskId: requiredId,
      consecutiveSkipCount: nonNegativeInteger,
    })
    .strict(),
  "programme.started": z
    .object({ userId: requiredId, programmeId: requiredId })
    .strict(),
  "programme.completed": z
    .object({ userId: requiredId, programmeId: requiredId, programmeVersionId })
    .strict(),
  "programme.count_reached": z
    .object({ userId: requiredId, count: positiveInteger })
    .strict(),
  "streak.reached": z
    .object({ userId: requiredId, streakLength: positiveInteger })
    .strict(),
  "streak.broken": z
    .object({ userId: requiredId, priorLength: positiveInteger })
    .strict(),
  "streak.resumed": z.object({ userId: requiredId }).strict(),
  "week.completed": z
    .object({
      userId: requiredId,
      programmeId: requiredId,
      weekIndex: positiveInteger,
    })
    .strict(),
  "level.changed": z
    .object({
      userId: requiredId,
      newLevel: levelNameSchema,
      previousLevel: levelNameSchema,
    })
    .strict(),
  "platform.connected": z
    .object({ userId: requiredId, platform: requiredId })
    .strict(),
  "follower.milestone": z
    .object({
      userId: requiredId,
      tier: followerMilestoneTierSchema,
      followerCount: nonNegativeInteger,
    })
    .strict(),
  // Billing transitions, emitted by the Stripe webhook handler from the
  // confirmed subscription state — never from a Checkout return. `tier` is the
  // billing tier key (creator, pro); Free is not a subscription, so a return to
  // Free is `subscription.ended` rather than a start with tier "free".
  "subscription.started": z
    .object({
      userId: requiredId,
      tier: requiredId,
      foundingCreator: z.boolean(),
    })
    .strict(),
  "subscription.changed": z
    .object({
      userId: requiredId,
      tier: requiredId,
      previousTier: requiredId,
    })
    .strict(),
  "subscription.ended": z
    .object({ userId: requiredId, previousTier: requiredId })
    .strict(),
} as const satisfies Record<EventName, z.ZodType>;

const eventFields = {
  "task.completed": {
    userId: { type: "string" },
    programmeId: { type: "string" },
    taskId: { type: "string" },
    contentType: { type: "string" },
  },
  "task.skipped": {
    userId: { type: "string" },
    programmeId: { type: "string" },
    taskId: { type: "string" },
    consecutiveSkipCount: { type: "number" },
  },
  "programme.started": {
    userId: { type: "string" },
    programmeId: { type: "string" },
  },
  "programme.completed": {
    userId: { type: "string" },
    programmeId: { type: "string" },
  },
  "programme.count_reached": {
    userId: { type: "string" },
    count: { type: "number" },
  },
  "streak.reached": {
    userId: { type: "string" },
    streakLength: { type: "number" },
  },
  "streak.broken": {
    userId: { type: "string" },
    priorLength: { type: "number" },
  },
  "streak.resumed": { userId: { type: "string" } },
  "week.completed": {
    userId: { type: "string" },
    programmeId: { type: "string" },
    weekIndex: { type: "number" },
  },
  "level.changed": {
    userId: { type: "string" },
    newLevel: { type: "string" },
    previousLevel: { type: "string" },
  },
  "platform.connected": {
    userId: { type: "string" },
    platform: { type: "string" },
  },
  "follower.milestone": {
    userId: { type: "string" },
    tier: { type: "number" },
    followerCount: { type: "number" },
  },
  "subscription.started": {
    userId: { type: "string" },
    tier: { type: "string" },
    foundingCreator: { type: "boolean" },
  },
  "subscription.changed": {
    userId: { type: "string" },
    tier: { type: "string" },
    previousTier: { type: "string" },
  },
  "subscription.ended": {
    userId: { type: "string" },
    previousTier: { type: "string" },
  },
} as const satisfies Record<EventName, Record<string, FieldDefinition>>;

export const userAttributeFields = {
  // The Stripe subscription status of the user's current subscription
  // ("active", "past_due", "canceled", ...) or "none" when they have never
  // subscribed. Which plan that buys is `subscription_tier`.
  subscription_status: { type: "string" },
  // The effective billing tier key: "free", "creator" or "pro". Resolved by
  // Billing from stored subscription state, so a lapsed subscription reads as
  // "free" here while `subscription_status` still says why.
  subscription_tier: { type: "string" },
  user_type: { type: "string" },
  experience_level: { type: "string" },
  is_founding_creator: { type: "boolean" },
  lifetime_task_completions: { type: "number" },
  programmes_completed: { type: "number" },
} as const satisfies Record<UserAttributeName, FieldDefinition>;

export const operatorDefinitions = {
  eq: { valueCardinality: "single", fieldTypes: ["string", "number", "boolean"] },
  neq: { valueCardinality: "single", fieldTypes: ["string", "number", "boolean"] },
  in: { valueCardinality: "list", fieldTypes: ["string", "number", "boolean"] },
  gte: { valueCardinality: "single", fieldTypes: ["number"] },
  lte: { valueCardinality: "single", fieldTypes: ["number"] },
} as const satisfies Record<
  Operator,
  {
    readonly valueCardinality: "single" | "list";
    readonly fieldTypes: readonly FieldType[];
  }
>;

const effects = Object.fromEntries(
  effectTypes.map((name) => [name, { authorTimeAllowed: name !== "grant_call" }]),
) as Record<EffectType, { readonly authorTimeAllowed: boolean }>;

const events = Object.fromEntries(
  eventNames.map((name) => [
    name,
    { schema: eventPayloadSchemas[name], fields: eventFields[name] },
  ]),
) as {
  readonly [Name in EventName]: {
    readonly schema: (typeof eventPayloadSchemas)[Name];
    readonly fields: (typeof eventFields)[Name];
  };
};

export const contentEngineCatalogue = {
  events,
  operators: operatorDefinitions,
  conditionSources,
  userAttributes: userAttributeFields,
  effects,
  dedupeScopes,
} as const;

export type ContentEngineCatalogue = typeof contentEngineCatalogue;

export type EventPayload<Name extends EventName> = z.infer<
  (typeof eventPayloadSchemas)[Name]
>;
