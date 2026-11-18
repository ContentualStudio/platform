import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import {
  validateMatchingSetupForPublish,
  type AuthoredMatchingRule,
  type AuthoredMatchingSetup,
  type MatchingValidationError,
} from "../matching/matching-authoring";
import {
  publishMatchingSetup,
  type PublishedVersionSummary,
} from "../matching/matching-publish";
import { payloadProgrammeTargets } from "../matching/programme-targets";
// The slug the content seed created. Imported rather than restated so the two
// cannot disagree about which programme the fallback targets.
import { FIRST_TAKE_SLUG } from "./first-take-v1.1";

/**
 * Seeds the first published matching setup.
 *
 * The released behaviour was "everybody gets First Take", expressed as a
 * catch-all in application code. This reproduces it exactly — one fallback
 * rule, no normal rules — but as *content*, which is the whole point of the
 * cutover: the same outcome, now changeable without a release.
 *
 * First Take is named here, in a seed, and nowhere in the runtime matching
 * path. A seed is a one-time authoring act on the team's behalf, not a
 * constant the matcher reads; the day the team publishes a different fallback,
 * nothing in this file runs again.
 */
export const FIRST_TAKE_SETUP_LABEL = "Launch setup — First Take for everyone";

export { FIRST_TAKE_SLUG };

const MATCHING_SETUPS = "matching-setups";

export interface SeedMatchingResult {
  documentId: string;
  version: PublishedVersionSummary;
  created: boolean;
}

export class MatchingSeedError extends Error {
  constructor(
    message: string,
    readonly errors: readonly MatchingValidationError[] = [],
  ) {
    super(message);
    this.name = "MatchingSeedError";
  }
}

async function findPublishedFirstTake(payload: Payload): Promise<string> {
  const result = await payload.find({
    collection: "programmes",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { slug: { equals: FIRST_TAKE_SLUG } },
        { _status: { equals: "published" } },
      ],
    },
  });
  const programme = result.docs[0];

  if (!programme) {
    throw new MatchingSeedError(
      `No published "${FIRST_TAKE_SLUG}" programme exists yet. Run the First Take content seed first — a fallback with no published target would publish a setup that cannot assign anyone.`,
    );
  }

  return String(programme.id);
}

interface SeededDraft {
  id: string;
  created: boolean;
  document: AuthoredMatchingSetup;
}

// Idempotent by label. Re-running the seed edits the same draft rather than
// accumulating near-identical setups an operator then has to tell apart.
async function upsertDraft(
  payload: Payload,
  programmeId: string,
): Promise<SeededDraft> {
  const existing = await payload.find({
    collection: MATCHING_SETUPS,
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { label: { equals: FIRST_TAKE_SETUP_LABEL } },
  });
  const rules: AuthoredMatchingRule[] = [
    {
      // Stable across re-runs: the rule id is what an assignment cites, so
      // regenerating it would detach past matches from the rule that made them.
      id: "first-take-fallback",
      name: "Everyone else",
      programme: programmeId,
      active: true,
      priority: null,
      fallback: true,
      explanation:
        "First Take is where every creator starts while the team is still authoring narrower routes.",
      conditions: [],
    },
  ];
  const data = {
    label: FIRST_TAKE_SETUP_LABEL,
    notes:
      "Seeded at cutover to reproduce the released behaviour as content. Add normal rules above the fallback to route specific audiences elsewhere.",
    rules,
    _status: "published" as const,
  };
  const found = existing.docs[0];

  if (found) {
    await payload.update({
      collection: MATCHING_SETUPS,
      id: found.id,
      data,
      overrideAccess: true,
    });

    return { id: String(found.id), created: false, document: data };
  }

  const created = await payload.create({
    collection: MATCHING_SETUPS,
    data,
    overrideAccess: true,
  });

  return { id: String(created.id), created: true, document: data };
}

export async function seedFirstTakeMatching(
  payload: Payload,
  options: { actor?: string } = {},
): Promise<SeedMatchingResult> {
  const programmeId = await findPublishedFirstTake(payload);
  const draft = await upsertDraft(payload, programmeId);

  // The seed goes through the same validator the publish endpoint uses. A seed
  // that could publish something an operator could not is a seed that will one
  // day put an unpublishable setup in production. It validates the object it
  // just wrote rather than reading it back, so there is one description of what
  // is being published.
  const validation = await validateMatchingSetupForPublish(
    draft.document,
    payloadProgrammeTargets(payload),
  );

  if (!validation.valid) {
    throw new MatchingSeedError(
      "The seeded matching setup is not publishable.",
      validation.errors,
    );
  }

  const version = await publishMatchingSetup({
    sourceDocumentId: draft.id,
    label: FIRST_TAKE_SETUP_LABEL,
    rules: validation.rules,
    actor: options.actor ?? "seed:first-take-matching-v1",
    correlationId: `seed-${randomUUID()}`,
    programmeTargets: validation.programmeTargets,
  });

  return { documentId: draft.id, version, created: draft.created };
}
