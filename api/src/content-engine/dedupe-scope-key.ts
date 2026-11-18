import {
  dedupeScopeTokens,
  type DedupeScope,
} from "@contentual/content-engine-vocabulary";

// Everything the ledger needs to reserve a firing. `eventId` is supplied by the
// caller (the evaluator, ticket 5) from its own event envelope — the ledger does
// not define an envelope contract.
export interface FiringContext {
  ruleId: string;
  userId: string;
  dedupeScope: DedupeScope;
  programmeId?: string | null;
  eventId: string;
}

export type ScopeKeyResult =
  | { ok: true; scopeKey: string }
  | { ok: false; reason: "missing_programme_id" | "missing_event_id" };

// Keys are namespaced so the three scopes occupy disjoint key spaces: a
// programme or event id of "*" cannot alias the once_per_user constant, and a
// rule whose dedupe scope is re-authored does not inherit its old keys.
const ONCE_PER_USER_KEY = "user:*";

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Authored input can be incomplete, so an underivable key is a reported result
// rather than a throw — same convention as the vocabulary package's
// validateCondition.
export function dedupeScopeKey(context: FiringContext): ScopeKeyResult {
  switch (context.dedupeScope) {
    case dedupeScopeTokens.oncePerUser:
      return { ok: true, scopeKey: ONCE_PER_USER_KEY };

    case dedupeScopeTokens.oncePerUserPerProgramme: {
      const programmeId = present(context.programmeId);

      if (!programmeId) {
        return { ok: false, reason: "missing_programme_id" };
      }

      return { ok: true, scopeKey: `programme:${programmeId}` };
    }

    case dedupeScopeTokens.everyTime: {
      const eventId = present(context.eventId);

      if (!eventId) {
        return { ok: false, reason: "missing_event_id" };
      }

      return { ok: true, scopeKey: `event:${eventId}` };
    }

    default: {
      // A fourth dedupe scope in the vocabulary must break the build here.
      const exhaustive: never = context.dedupeScope;
      throw new Error(`Unhandled dedupe scope: ${String(exhaustive)}`);
    }
  }
}
