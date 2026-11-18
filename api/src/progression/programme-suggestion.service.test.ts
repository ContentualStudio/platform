import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type {
  ActiveProgramme,
  ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import { ProgrammeSuggestionService } from "./programme-suggestion.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

function programme(
  slug: string,
  overrides: Partial<Programme> = {},
): Programme {
  return {
    id: slug,
    title: `Title ${slug}`,
    access: "open",
    description: `About ${slug}`,
    features: [],
    difficulty: 3,
    level: "Beginner",
    durationLabel: "21 days",
    durationDays: 21,
    ...overrides,
  } as Programme;
}

const suggestedAt = new Date("2026-09-01T10:00:00Z");

function build(options: {
  latest?: {
    id: string;
    programmeId: string;
    programmeSlug?: string;
    dismissed?: boolean;
  } | null;
  active?: ActiveProgramme[];
  runningSlug?: string | null;
  startedSince?: boolean;
  owned?: boolean;
  setupCompleted?: boolean;
}) {
  const queries: { sql: string; parameters: unknown[] }[] = [];

  const dataSource = {
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });

      if (sql.includes('LEFT JOIN "programme_suggestion_dismissal"')) {
        return options.latest
          ? [
              {
                ...options.latest,
                dismissed: options.latest.dismissed ?? false,
                createdAt: suggestedAt,
              },
            ]
          : [];
      }

      if (sql.includes('FROM "programme_enrolment"')) {
        return options.startedSince ? [{ "?column?": 1 }] : [];
      }

      if (sql.includes('FROM "challenge_setup"')) {
        return options.setupCompleted === false ? [] : [{ "?column?": 1 }];
      }

      if (sql.includes('FROM "engine_programme_suggestion"')) {
        return options.owned ? [{ "?column?": 1 }] : [];
      }

      return [];
    },
  };

  const enrolments = {
    findActiveForUser: async () =>
      options.runningSlug ? { programmeSlug: options.runningSlug } : null,
  };

  const contentReader = {
    listActiveProgrammesWithIdentity: async () => options.active ?? [],
  } as unknown as ProgrammeContentReader;

  const service = new ProgrammeSuggestionService(
    dataSource as never,
    enrolments as never,
    contentReader,
  );

  return { service, queries };
}

const growth: ActiveProgramme = {
  programme: programme("growth", { track: "grow" }),
  sourceDocumentId: "doc-growth",
};

test("the newest suggestion surfaces with its programme's slug, title and track", async () => {
  const { service, queries } = build({
    latest: { id: "7", programmeId: "doc-growth" },
    active: [growth],
  });

  assert.deepEqual(await service.activeForUser(user), {
    id: "7",
    slug: "growth",
    title: "Title growth",
    track: "grow",
    description: "About growth",
  });
  // Scoped to the caller on every read.
  assert.deepEqual(queries[0]?.parameters, ["user-1"]);
});

test("no recorded suggestion renders nothing", async () => {
  const { service } = build({ latest: null, active: [growth] });

  assert.equal(await service.activeForUser(user), null);
});

test("a dismissed suggestion stays dismissed and nothing older takes its place", async () => {
  const { service, queries } = build({
    latest: { id: "7", programmeId: "doc-growth", dismissed: true },
    active: [growth],
  });

  assert.equal(await service.activeForUser(user), null);
  assert.match(queries[0]?.sql ?? "", /LIMIT 1/);
});

test("a suggestion whose programme is missing or inactive is omitted", async () => {
  const { service } = build({
    latest: { id: "7", programmeId: "doc-retired" },
    active: [growth],
  });

  assert.equal(await service.activeForUser(user), null);
});

test("starting the suggested programme since it was recorded resolves it", async () => {
  const { service, queries } = build({
    latest: { id: "7", programmeId: "doc-growth" },
    active: [growth],
    startedSince: true,
  });

  assert.equal(await service.activeForUser(user), null);

  const startedQuery = queries.find((query) =>
    query.sql.includes('FROM "programme_enrolment"'),
  );
  assert.deepEqual(startedQuery?.parameters, ["user-1", "growth", suggestedAt, "growth"]);
});

test("nothing is offered while a programme is running", async () => {
  const { service } = build({
    latest: { id: "7", programmeId: "doc-growth" },
    active: [growth],
    runningSlug: "foundation",
  });

  assert.equal(await service.activeForUser(user), null);
});

test("nothing is offered before challenge setup is complete", async () => {
  const { service } = build({
    latest: { id: "7", programmeId: "doc-growth" },
    active: [growth],
    setupCompleted: false,
  });

  assert.equal(await service.activeForUser(user), null);
});

test("an absent description is returned as null so the card can omit it", async () => {
  const { service } = build({
    latest: { id: "7", programmeId: "doc-growth" },
    active: [
      {
        programme: programme("growth", { description: "" }),
        sourceDocumentId: "doc-growth",
      },
    ],
  });

  const suggestion = await service.activeForUser(user);
  assert.equal(suggestion?.description, null);
  assert.equal(suggestion?.track, null);
});

test("dismiss records the caller's own suggestion", async () => {
  const { service, queries } = build({ owned: true });

  await service.dismiss(user, "7");

  const insert = queries.find((query) =>
    query.sql.includes('INSERT INTO "programme_suggestion_dismissal"'),
  );
  assert.deepEqual(insert?.parameters, ["7", "user-1"]);
  assert.match(insert?.sql ?? "", /ON CONFLICT/);
});

test("dismissing somebody else's suggestion is refused as not found and writes nothing", async () => {
  const { service, queries } = build({ owned: false });

  await assert.rejects(service.dismiss(user, "7"), NotFoundException);
  assert.ok(!queries.some((query) => query.sql.includes("INSERT")));
});

test("a malformed id is refused before it reaches the database", async () => {
  for (const id of ["abc", "0", "-1", "1.5", "1234567890123456789"]) {
    const { service, queries } = build({ owned: true });

    await assert.rejects(service.dismiss(user, id), NotFoundException);
    assert.equal(queries.length, 0);
  }
});

test("a persisted no-suggestion resolution renders nothing", async () => {
  const { service } = build({
    latest: {
      id: null as unknown as string,
      programmeId: null as unknown as string,
    },
    active: [growth],
  });
  assert.equal(await service.activeForUser(user), null);
});

test('a renamed programme keeps its saved winner identity', async () => {
  const { service } = build({
    latest: { id: '7', programmeId: 'doc-growth', programmeSlug: 'old-slug' },
    active: [growth, { sourceDocumentId: 'different-document', programme: programme('old-slug') }],
  });
  assert.equal((await service.activeForUser(user))?.slug, 'growth');
});
