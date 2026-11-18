import type { PublishedMatchingSetup } from "@contentual/programme-matching-vocabulary";

// The shape of the first published setup: one explicit fallback and no normal
// rules. It is a *fixture*, not a constant the runtime reads — the real one is
// authored in the CMS and seeded into the database. Its only job here is to let
// tests prove the released behaviour (everyone lands on First Take) survives
// the move to content-managed rules.
export const FIRST_TAKE_FIXTURE_KEY = "first-take";

export function firstTakeFallbackSetup(
  overrides: Partial<PublishedMatchingSetup> = {},
): PublishedMatchingSetup {
  return {
    setupVersionId: "setup-first-take-v1",
    publishedAt: "2026-08-27T00:00:00.000Z",
    rules: [
      {
        id: "rule-fallback",
        name: "Everyone else",
        programmeKey: FIRST_TAKE_FIXTURE_KEY,
        programmeVersionId: "first-take-v1",
        active: true,
        priority: null,
        fallback: true,
        explanation:
          "First Take is where every creator starts until the team publishes a narrower route.",
        conditions: [],
      },
    ],
    ...overrides,
  };
}
