import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import {
  experienceLevels,
  followerRanges,
  mainGoals,
  matchingFieldTokens,
  matchingOperatorTokens,
  nicheStatuses,
  platforms,
  postingFrequencies,
  userTypes,
} from "@contentual/programme-matching-vocabulary";
import {
  validateMatchingSetupForPublish,
  type AuthoredMatchingRule,
  type AuthoredMatchingSetup,
} from "../matching/matching-authoring";
import { publishMatchingSetup } from "../matching/matching-publish";
import { payloadProgrammeTargets } from "../matching/programme-targets";
import { FIRST_TAKE_SLUG } from "./first-take-v1.1";
import { MatchingSeedError, type SeedMatchingResult } from "./first-take-matching-v1";
import { catalogueProgrammes } from "./programme-catalogue-v1";

/**
 * The suggested initial rules from the specification, authored as content.
 *
 * These are the team's starting examples, not application logic: the priorities
 * and conditions below are exactly what an operator would type into the rule
 * builder, and the day they change one, nothing in this file runs again. The
 * seed exists so the matching engine can be exercised against a full ladder of
 * programmes instead of a lone fallback.
 *
 * Where the questionnaire does not ask the question a programme describes, the
 * specification allows the closest structured signals — written out explicitly
 * here, never inferred at match time.
 */
export const CATALOGUE_SETUP_LABEL =
  "LOCAL DEMO — suggested rules for six programmes plus First Take";

const MATCHING_SETUPS = "matching-setups";

// Helpers that pin each literal to its catalogue tuple, so a mistyped answer
// (an en dash typed as a hyphen, say) is a compile error rather than a rule
// that silently never matches.
const experience = (value: (typeof experienceLevels)[number]) => value;
const goal = (value: (typeof mainGoals)[number]) => value;
const niche = (value: (typeof nicheStatuses)[number]) => value;
const platform = (value: (typeof platforms)[number]) => value;
const frequency = (value: (typeof postingFrequencies)[number]) => value;
const followers = (value: (typeof followerRanges)[number]) => value;
const user = (value: (typeof userTypes)[number]) => value;

const f = matchingFieldTokens;
const op = matchingOperatorTokens;

interface CatalogueRuleSpec {
  id: string;
  name: string;
  programmeSlug: string;
  priority: number;
  explanation: string;
  conditions: Array<{
    field: (typeof matchingFieldTokens)[keyof typeof matchingFieldTokens];
    operator: (typeof matchingOperatorTokens)[keyof typeof matchingOperatorTokens];
    acceptedValues: (string | number)[];
  }>;
}

export const catalogueRules: readonly CatalogueRuleSpec[] = [
  {
    id: "business-kickstart-primary",
    name: "Business owners starting out",
    programmeSlug: "business-kickstart",
    priority: 100,
    explanation:
      "You told us you run a business, are early in your content journey, and want content to build that business.",
    conditions: [
      {
        field: f.userType,
        operator: op.equals,
        acceptedValues: [user("Business Owner")],
      },
      {
        field: f.experienceLevel,
        operator: op.oneOf,
        acceptedValues: [
          experience("Just getting started (0–3 months)"),
          experience("On-and-off"),
        ],
      },
      {
        field: f.mainGoal,
        operator: op.equals,
        acceptedValues: [goal("Build my business")],
      },
    ],
  },
  {
    id: "find-your-niche-primary",
    name: "Beginners without a niche",
    programmeSlug: "find-your-niche",
    priority: 90,
    explanation:
      "You are early on and told us you have not settled on a niche yet, so this starts by narrowing that down.",
    conditions: [
      {
        field: f.nicheDefined,
        operator: op.equals,
        acceptedValues: [niche("Not yet")],
      },
      {
        field: f.experienceLevel,
        operator: op.oneOf,
        acceptedValues: [
          experience("Just getting started (0–3 months)"),
          experience("Consistent beginner (3–6 months)"),
        ],
      },
    ],
  },
  {
    id: "youtube-deep-dive-primary",
    name: "YouTube-first creators with some experience",
    programmeSlug: "youtube-deep-dive",
    priority: 80,
    explanation:
      "YouTube is your primary platform and you already have posting experience behind you.",
    conditions: [
      {
        field: f.primaryPlatform,
        operator: op.equals,
        acceptedValues: [platform("YouTube")],
      },
      {
        field: f.experienceLevel,
        operator: op.oneOf,
        acceptedValues: [
          experience("Consistent beginner (3–6 months)"),
          experience("Intermediate (6–18 months)"),
          experience("Experienced (2+ years)"),
        ],
      },
    ],
  },
  {
    id: "plateau-breaker-primary",
    name: "Regular posters whose engagement has stalled",
    programmeSlug: "plateau-breaker",
    priority: 70,
    explanation:
      "You are already posting regularly with experience behind you, and engagement is what you want to move.",
    conditions: [
      {
        field: f.experienceLevel,
        operator: op.oneOf,
        acceptedValues: [
          experience("Intermediate (6–18 months)"),
          experience("Experienced (2+ years)"),
        ],
      },
      {
        // "Posting regularly" has no question of its own; weekly or more is the
        // closest structured signal the questionnaire offers.
        field: f.currentPostingFrequency,
        operator: op.gte,
        acceptedValues: [frequency("Weekly")],
      },
      {
        field: f.mainGoal,
        operator: op.equals,
        acceptedValues: [goal("Increase engagement")],
      },
    ],
  },
  {
    id: "brand-builder-primary",
    name: "Experienced creators with an established audience",
    programmeSlug: "brand-builder",
    priority: 60,
    explanation:
      "You have years of experience and an established following, and want to grow the audience or the business around it.",
    conditions: [
      {
        field: f.experienceLevel,
        operator: op.equals,
        acceptedValues: [experience("Experienced (2+ years)")],
      },
      {
        field: f.followerRange,
        operator: op.gte,
        acceptedValues: [followers("1,001–5,000")],
      },
      {
        field: f.mainGoal,
        operator: op.oneOf,
        acceptedValues: [goal("Grow my audience"), goal("Build my business")],
      },
    ],
  },
  {
    id: "thirty-day-foundations-primary",
    name: "Start-stop creators chasing consistency",
    programmeSlug: "thirty-day-foundations",
    priority: 50,
    explanation:
      "You have been on and off with content and told us consistency is the thing you want to fix.",
    conditions: [
      {
        field: f.experienceLevel,
        operator: op.oneOf,
        acceptedValues: [
          experience("On-and-off"),
          experience("Consistent beginner (3–6 months)"),
        ],
      },
      {
        field: f.mainGoal,
        operator: op.equals,
        acceptedValues: [goal("Be more consistent")],
      },
    ],
  },
];

// Guards the seed against its own two files drifting apart: a rule pointing at
// a programme this seed never creates would only fail at publish time, with a
// message about a missing target rather than about the seed.
const catalogueSlugs = new Set(catalogueProgrammes.map((spec) => spec.slug));
for (const rule of catalogueRules) {
  if (!catalogueSlugs.has(rule.programmeSlug)) {
    throw new Error(
      `Rule "${rule.name}" targets "${rule.programmeSlug}", which the programme catalogue seed does not create.`,
    );
  }
}

async function publishedProgrammeId(
  payload: Payload,
  slug: string,
): Promise<string> {
  const result = await payload.find({
    collection: "programmes",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
  });
  const programme = result.docs[0];

  if (!programme) {
    throw new MatchingSeedError(
      `No published "${slug}" programme exists yet. Run the programme catalogue content seed first — a rule with no published target cannot be published.`,
    );
  }

  return String(programme.id);
}

async function buildRules(payload: Payload): Promise<AuthoredMatchingRule[]> {
  const rules: AuthoredMatchingRule[] = [];

  for (const spec of catalogueRules) {
    rules.push({
      id: spec.id,
      name: spec.name,
      programme: await publishedProgrammeId(payload, spec.programmeSlug),
      active: true,
      priority: spec.priority,
      fallback: false,
      explanation: spec.explanation,
      conditions: spec.conditions,
    });
  }

  rules.push({
    // The same rule id the launch setup used, so an assignment made under the
    // fallback still cites a rule that exists.
    id: "first-take-fallback",
    name: "Everyone else",
    programme: await publishedProgrammeId(payload, FIRST_TAKE_SLUG),
    active: true,
    priority: null,
    fallback: true,
    explanation:
      "First Take is where every creator starts when no narrower programme fits.",
    conditions: [],
  });

  return rules;
}

// Idempotent by label, like the launch seed.
async function upsertDraft(
  payload: Payload,
  rules: AuthoredMatchingRule[],
): Promise<{ id: string; created: boolean; document: AuthoredMatchingSetup }> {
  const data = {
    label: CATALOGUE_SETUP_LABEL,
    notes:
      "LOCAL DEMO ONLY. Seeded from the specification's suggested initial rules so matching can be tested against a full ladder of programmes. The additional curriculum is placeholder test content, not client-approved programme content.",
    rules,
    _status: "published" as const,
  };
  const existing = await payload.find({
    collection: MATCHING_SETUPS,
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { label: { equals: CATALOGUE_SETUP_LABEL } },
  });
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

export async function seedCatalogueMatching(
  payload: Payload,
  options: { actor?: string } = {},
): Promise<SeedMatchingResult> {
  const draft = await upsertDraft(payload, await buildRules(payload));

  // Same validator the publish endpoint uses, on the object just written, so a
  // seed can never publish something an operator could not.
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
    label: CATALOGUE_SETUP_LABEL,
    rules: validation.rules,
    actor: options.actor ?? "seed:programme-catalogue-matching-v1",
    correlationId: `seed-${randomUUID()}`,
    programmeTargets: validation.programmeTargets,
  });

  return { documentId: draft.id, version, created: draft.created };
}
