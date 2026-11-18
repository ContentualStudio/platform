import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../database/testing/test-data-source";
import { ProgrammeSuggestionService } from "./programme-suggestion.service";

// The real suggestion, dismissal and enrolment tables, so the SQL itself is
// what is under test. The content mirror and the running-enrolment lookup are
// stubbed: both have their own suites.
const USER_ID = "programme-suggestion-user";
const OTHER_USER_ID = "programme-suggestion-other-user";
const USERS = [USER_ID, OTHER_USER_ID];

const user: AuthenticatedUser = {
  id: USER_ID,
  email: `${USER_ID}@example.test`,
  image: null,
  name: "Suggestion",
  onboardingCompleted: true,
};

const growth = {
  id: "30-day-growth",
  title: "30 Day Growth",
  access: "open",
  description: "Grow.",
  durationDays: 30,
} as Programme;

let dataSource: DataSource;

function buildService() {
  const contentReader = {
    listActiveProgrammesWithIdentity: async () => [
      { programme: growth, sourceDocumentId: "doc-growth" },
    ],
  } as unknown as ProgrammeContentReader;

  return new ProgrammeSuggestionService(
    dataSource,
    { findActiveForUser: async () => null } as never,
    contentReader,
  );
}

async function suggest(
  userId: string,
  programmeId: string,
  createdAt: string,
): Promise<string> {
  const [row] = (await dataSource.query(
    `INSERT INTO "engine_programme_suggestion"
       ("userId", "programmeId", "ruleId", "eventId", "createdAt")
     VALUES ($1, $2, 'rule', 'event', $3)
     RETURNING "id"`,
    [userId, programmeId, createdAt],
  )) as { id: string }[];

  return String(row?.id);
}

async function enrol(programmeSlug: string, startedAt: string) {
  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("userId", "programmeSlug", "status", "startedAt", "currentDay",
        "durationDays", "day1ScheduledFor", "completedAt")
     VALUES ($1, $2, 'completed', $3, 30, 30, $4, $3)`,
    [USER_ID, programmeSlug, startedAt, startedAt.slice(0, 10)],
  );
}

async function clear() {
  for (const table of [
    "programme_completion_suggestion",
    "content_engine_events",
    "programme_suggestion_dismissal",
    "challenge_setup",
    "engine_programme_suggestion",
    "programme_enrolment",
  ]) {
    await dataSource.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1)`, [
      USERS,
    ]);
  }
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [USERS]);
}

before(async () => {
  if (skip) {
    return;
  }

  dataSource = await openTestDataSource();
});

beforeEach(async () => {
  if (skip) {
    return;
  }

  await clear();
  for (const id of USERS) {
    await dataSource.query(
      `INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`,
      [id, id, `${id}@example.test`],
    );
    await dataSource.query(
      `INSERT INTO "challenge_setup" ("userId", "setupCompletedAt") VALUES ($1, now())`,
      [id],
    );
  }
});

after(async () => {
  if (skip || !dataSource?.isInitialized) {
    return;
  }

  await clear();
  await dataSource.destroy();
});

test("the newest suggestion is the active one", { skip }, async () => {
  await suggest(USER_ID, "doc-retired", "2026-09-01T00:00:00Z");
  const newest = await suggest(USER_ID, "doc-growth", "2026-09-02T00:00:00Z");

  const suggestion = await buildService().activeForUser(user);

  assert.equal(suggestion?.id, newest);
  assert.equal(suggestion?.slug, "30-day-growth");
});

test("another user's suggestion is never read", { skip }, async () => {
  await suggest(OTHER_USER_ID, "doc-growth", "2026-09-02T00:00:00Z");

  assert.equal(await buildService().activeForUser(user), null);
});

test(
  "dismissing clears the suggestion and does not resurface an older one",
  { skip },
  async () => {
    await suggest(USER_ID, "doc-growth", "2026-09-01T00:00:00Z");
    const newest = await suggest(USER_ID, "doc-growth", "2026-09-02T00:00:00Z");
    const service = buildService();

    await service.dismiss(user, newest);
    // Idempotent: a second dismiss is not an error.
    await service.dismiss(user, newest);

    assert.equal(await service.activeForUser(user), null);
  },
);

test("a user cannot dismiss another user's suggestion", { skip }, async () => {
  const theirs = await suggest(
    OTHER_USER_ID,
    "doc-growth",
    "2026-09-02T00:00:00Z",
  );

  await assert.rejects(buildService().dismiss(user, theirs), NotFoundException);

  const rows = (await dataSource.query(
    `SELECT 1 FROM "programme_suggestion_dismissal" WHERE "suggestionId" = $1`,
    [theirs],
  )) as unknown[];
  assert.equal(rows.length, 0);
});

test(
  "starting the suggested programme after it was suggested resolves it",
  { skip },
  async () => {
    await suggest(USER_ID, "doc-growth", "2026-09-02T00:00:00Z");
    await enrol("30-day-growth", "2026-09-03T00:00:00Z");

    assert.equal(await buildService().activeForUser(user), null);
  },
);

test(
  "nothing is offered before challenge setup is complete",
  { skip },
  async () => {
    await suggest(USER_ID, "doc-growth", "2026-09-02T00:00:00Z");
    await dataSource.query(
      `UPDATE "challenge_setup" SET "setupCompletedAt" = NULL WHERE "userId" = $1`,
      [USER_ID],
    );

    assert.equal(await buildService().activeForUser(user), null);
  },
);

test(
  "an earlier run of the same programme does not resolve a newer suggestion",
  { skip },
  async () => {
    await enrol("30-day-growth", "2026-08-01T00:00:00Z");
    await suggest(USER_ID, "doc-growth", "2026-09-02T00:00:00Z");

    assert.equal(
      (await buildService().activeForUser(user))?.slug,
      "30-day-growth",
    );
  },
);

test(
  "completion winner is saved once; dismissal and replay never promote a loser",
  { skip },
  async () => {
    const { CompletionSuggestionResolver } =
      await import("./completion-suggestion-resolver");
    const eventId = "suggestion-completion-integration";
    const event = {
      id: eventId,
      userId: USER_ID,
      eventName: "programme.completed",
      payload: {},
    } as never;
    await dataSource.query(
      `INSERT INTO "content_engine_events" ("id", "userId", "eventName", "payload") VALUES ($1, $2, 'programme.completed', '{}')`,
      [eventId, USER_ID],
    );
    const low = await suggest(USER_ID, "doc-growth", "2026-09-03T00:00:00Z");
    const high = await suggest(USER_ID, "doc-growth", "2026-09-03T00:00:01Z");
    await dataSource.query(
      'UPDATE "engine_programme_suggestion" SET "eventId" = $1, "priority" = CASE WHEN "id" = $2 THEN 1 ELSE 90 END WHERE "id" IN ($2, $3)',
      [eventId, low, high],
    );
    const resolver = new CompletionSuggestionResolver(dataSource, {
      listActiveProgrammesWithIdentity: async () => [
        { programme: growth, sourceDocumentId: "doc-growth" },
      ],
    } as never);
    assert.equal(
      await buildService().activeForUser(user),
      null,
      "pending candidates do not surface",
    );
    await Promise.all([resolver.resolve(event), resolver.resolve(event)]);
    assert.equal((await buildService().activeForUser(user))?.id, low);
    await buildService().dismiss(user, low);
    await dataSource.query(
      'UPDATE "engine_programme_suggestion" SET "priority" = 0 WHERE "id" = $1',
      [high],
    );
    await resolver.resolve(event);
    assert.equal(await buildService().activeForUser(user), null);
    const resolutions = await dataSource.query(
      'SELECT * FROM "programme_completion_suggestion" WHERE "eventId" = $1',
      [eventId],
    );
    assert.equal(resolutions.length, 1);
    assert.equal(String(resolutions[0].suggestionId), low);
  },
);

test(
  "a completion with no valid suggestion suppresses older suggestions",
  { skip },
  async () => {
    const { CompletionSuggestionResolver } =
      await import("./completion-suggestion-resolver");
    await suggest(USER_ID, "doc-growth", "2020-01-01T00:00:00Z");
    const eventId = "suggestion-empty-completion-integration";
    await dataSource.query(
      `INSERT INTO "content_engine_events" ("id", "userId", "eventName", "payload") VALUES ($1, $2, 'programme.completed', '{}')`,
      [eventId, USER_ID],
    );
    const resolver = new CompletionSuggestionResolver(dataSource, {
      listActiveProgrammesWithIdentity: async () => [],
    } as never);
    await resolver.resolve({
      id: eventId,
      userId: USER_ID,
      eventName: "programme.completed",
      payload: {},
    } as never);
    assert.equal(await buildService().activeForUser(user), null);
  },
);
