import { eventNames } from "@contentual/content-engine-vocabulary";

/**
 * Every product-analytics event name this product emits.
 *
 * One closed list, because a funnel is only as good as the consistency of the
 * names it is built from: `task_completed` in one place and `taskComplete` in
 * another are two events as far as PostHog is concerned, and the difference is
 * invisible until somebody tries to build the funnel.
 *
 * Two families live here:
 *
 * - `content_engine.*` — one per Content Engine domain event, derived below from
 *   the vocabulary rather than restated, so a new domain event cannot arrive
 *   without a product event to match.
 * - everything else — moments that are not modelled as domain events: the
 *   onboarding steps, the badge award, and the auth transitions.
 */

// Domain events already have canonical names owned by the vocabulary. Prefixing
// rather than renaming keeps the two sets legible in PostHog and makes the
// mapping mechanical: no per-event translation table to fall out of date.
export const contentEngineEventPrefix = "content_engine";

export type ContentEngineProductEventName =
  `${typeof contentEngineEventPrefix}.${(typeof eventNames)[number]}`;

export function contentEngineProductEventName(
  eventName: (typeof eventNames)[number],
): ContentEngineProductEventName {
  return `${contentEngineEventPrefix}.${eventName}`;
}

// Moments with no domain event behind them. `badge_earned` is an effect outcome,
// the onboarding steps are request-scoped, and the auth transitions happen
// before there is a user to attribute a domain event to.
//
// Nothing here may restate a moment the Content Engine already emits. "Begin
// programme", for instance, emits `programme.started` and is captured from the
// dispatcher — a second name for it would split one funnel across two events.
export const standaloneProductEvents = [
  "badge_earned",
  "onboarding_stage1_saved",
  "onboarding_stage2_saved",
  "onboarding_stage2_completed",
  "programme_matching_shadow_mismatch",
  "user_signed_up",
  "user_signed_in",
  "user_signed_out",
  "login_code_requested",
  "checkout_started",
  "billing_portal_opened",
  "referral_attached",
  "founding_cohort_full",
] as const;

export type StandaloneProductEventName =
  (typeof standaloneProductEvents)[number];

export type ProductEventName =
  | ContentEngineProductEventName
  | StandaloneProductEventName;

/**
 * Named handles for the standalone tokens.
 *
 * Call sites refer to these rather than writing the string, for the same reason
 * the Content Engine vocabulary forbids literals: a typo in a literal is a
 * silently separate event, while a typo here does not compile.
 */
export const productEventTokens = {
  badgeEarned: "badge_earned",
  onboardingStage1Saved: "onboarding_stage1_saved",
  onboardingStage2Saved: "onboarding_stage2_saved",
  onboardingStage2Completed: "onboarding_stage2_completed",
  programmeMatchingShadowMismatch: "programme_matching_shadow_mismatch",
  userSignedUp: "user_signed_up",
  userSignedIn: "user_signed_in",
  userSignedOut: "user_signed_out",
  loginCodeRequested: "login_code_requested",
  // Billing moments with no domain event behind them. The confirmed
  // subscription transitions are domain events (`subscription.*`) and are
  // captured from the dispatcher like every other one.
  checkoutStarted: "checkout_started",
  billingPortalOpened: "billing_portal_opened",
  referralAttached: "referral_attached",
  foundingCohortFull: "founding_cohort_full",
} as const satisfies Record<string, StandaloneProductEventName>;

// `satisfies` constrains the values but not the key set, so on its own it would
// let a newly added event go unnamed. This makes the coverage a compile error
// rather than something noticed when a call site cannot find its token.
type Unnamed<
  Tuple extends readonly string[],
  Tokens extends Record<string, string>,
> = Exclude<Tuple[number], Tokens[keyof Tokens]>;

const everyTokenIsNamed: [
  Unnamed<typeof standaloneProductEvents, typeof productEventTokens>,
] extends never[]
  ? true
  : never = true;
void everyTokenIsNamed;

/**
 * The identity a product event is captured against.
 *
 * `userId` whenever the moment belongs to an authenticated user. `anonymousId`
 * is the PostHog distinct id the browser already generated, used for the
 * pre-auth moments: capturing them against a server-invented id would strand
 * them in a person PostHog can never reconcile with the real user.
 */
export type ProductEventIdentity =
  | { readonly userId: string }
  | { readonly anonymousId: string };

export function distinctIdFor(identity: ProductEventIdentity): string {
  return "userId" in identity ? identity.userId : identity.anonymousId;
}
