import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type {
  ActiveProgramme,
  ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import {
  freeEntitlements,
  type Entitlements,
} from "../billing/entitlement.service";
import { EligibleProgrammesService } from "./eligible-programmes.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

function programme(slug: string, overrides: Partial<Programme> = {}): Programme {
  return {
    id: slug,
    title: slug,
    access: "open",
    description: "",
    features: [],
    difficulty: 3,
    level: "Beginner",
    durationLabel: "21 days",
    durationDays: 21,
    milestones: [],
    insightMoments: [],
    ...overrides,
  } as Programme;
}

function build(options: {
  active?: Programme[];
  identities?: { slug: string; sourceDocumentId: string }[];
  unlocks?: { programmeId: string; createdAt: Date }[];
  lastViewedAt?: Date | null;
  activeSlug?: string | null;
  entitlements?: Partial<Entitlements>;
  tasks?: Record<string, { platform: string | null; contentType: string }[]>;
}) {
  const active = options.active ?? [];
  const bySlug = new Map(active.map((row) => [row.id, row]));
  const withIdentity: ActiveProgramme[] = (
    options.identities ??
    active.map((row) => ({ slug: row.id, sourceDocumentId: row.id }))
  )
    .map((identity) => ({
      programme: bySlug.get(identity.slug),
      sourceDocumentId: identity.sourceDocumentId,
    }))
    .filter((entry): entry is ActiveProgramme => Boolean(entry.programme));
  const writes: unknown[][] = [];

  const dataSource = {
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM "engine_programme_unlock"')) {
        return options.unlocks ?? [];
      }

      if (sql.includes('FROM "user_eligible_programmes_view"')) {
        return options.lastViewedAt
          ? [{ lastViewedAt: options.lastViewedAt }]
          : [];
      }

      writes.push(parameters);
      return [];
    },
  };

  const enrolments = {
    findActiveForUser: async () =>
      options.activeSlug ? { programmeSlug: options.activeSlug } : null,
  };

  const reader: Partial<ProgrammeContentReader> = {
    listActiveProgrammesWithIdentity: async () => withIdentity,
    tasksForProgramme: (async (slug: string) => options.tasks?.[slug] ?? []) as never,
  };

  const entitlements = {
    resolve: async () => ({ ...freeEntitlements, ...options.entitlements }),
  };

  const service = new EligibleProgrammesService(
    dataSource as never,
    enrolments as never,
    reader as never,
    entitlements as never,
  );

  return { service, writes };
}

test("the list is every active programme, keyed by slug", async () => {
  const { service } = build({
    active: [programme("first-take"), programme("30-day-foundation")],
  });

  const eligible = await service.listForUser(user);

  assert.deepEqual(
    eligible.map((row) => row.slug),
    ["first-take", "30-day-foundation"],
  );
  assert.equal(eligible.every((row) => row.unlocked === false), true);
});

test("an unlock record marks its programme unlocked, matched by mirror document id", async () => {
  const unlockedAt = new Date("2026-09-01T10:00:00.000Z");
  const { service } = build({
    active: [programme("first-take")],
    identities: [{ slug: "first-take", sourceDocumentId: "doc-7" }],
    unlocks: [{ programmeId: "doc-7", createdAt: unlockedAt }],
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.unlocked, true);
  assert.equal(row?.unlockedAt, unlockedAt.toISOString());
});

test("the same programme unlocked more than once appears exactly once", async () => {
  const { service } = build({
    active: [programme("first-take")],
    unlocks: [
      { programmeId: "first-take", createdAt: new Date("2026-09-01T10:00:00Z") },
      { programmeId: "first-take", createdAt: new Date("2026-09-02T10:00:00Z") },
    ],
  });

  const eligible = await service.listForUser(user);

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]?.unlocked, true);
});

test("an unlock for a programme with no active mirror row is omitted without erroring", async () => {
  const { service } = build({
    active: [programme("first-take")],
    identities: [{ slug: "first-take", sourceDocumentId: "doc-7" }],
    unlocks: [{ programmeId: "doc-retired", createdAt: new Date() }],
  });

  const eligible = await service.listForUser(user);

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]?.slug, "first-take");
  assert.equal(eligible[0]?.unlocked, false);
});

test("an unlock after the last view is newly unlocked; before it is not", async () => {
  const { service } = build({
    active: [programme("fresh"), programme("stale")],
    unlocks: [
      { programmeId: "fresh", createdAt: new Date("2026-09-05T10:00:00Z") },
      { programmeId: "stale", createdAt: new Date("2026-09-01T10:00:00Z") },
    ],
    lastViewedAt: new Date("2026-09-03T00:00:00Z"),
  });

  const eligible = await service.listForUser(user);

  assert.equal(eligible.find((row) => row.slug === "fresh")?.newlyUnlocked, true);
  assert.equal(eligible.find((row) => row.slug === "stale")?.newlyUnlocked, false);
});

test("a user who has never opened the list sees every unlock as new", async () => {
  const { service } = build({
    active: [programme("first-take")],
    unlocks: [{ programmeId: "first-take", createdAt: new Date("2020-01-01Z") }],
    lastViewedAt: null,
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.newlyUnlocked, true);
});

test("the running programme is flagged active so no redundant start is offered", async () => {
  const { service } = build({
    active: [programme("first-take"), programme("30-day-foundation")],
    activeSlug: "first-take",
  });

  const eligible = await service.listForUser(user);

  assert.equal(eligible.find((row) => row.slug === "first-take")?.active, true);
  assert.equal(
    eligible.find((row) => row.slug === "30-day-foundation")?.active,
    false,
  );
});

test("an empty active set yields an empty list rather than an error", async () => {
  const { service } = build({ active: [] });

  assert.deepEqual(await service.listForUser(user), []);
});

test("eligibility is the same answer the list gives", async () => {
  const { service } = build({ active: [programme("first-take")] });

  assert.equal(await service.isEligible(user, "first-take"), true);
  assert.equal(await service.isEligible(user, "not-a-programme"), false);
});

test("marking seen writes the watermark for the authenticated user", async () => {
  const { service, writes } = build({ active: [] });
  const seenAt = new Date("2026-09-07T09:00:00.000Z");

  await service.markSeen(user, seenAt);

  assert.deepEqual(writes, [["user-1", seenAt]]);
});

const locked = (slug: string, overrides: Partial<Programme> = {}) =>
  programme(slug, { ...overrides, access: "locked" });

test("a locked programme the user has no unlock for is absent from the list", async () => {
  const { service } = build({
    active: [programme("open-one"), locked("gated")],
  });

  assert.deepEqual(
    (await service.listForUser(user)).map((row) => row.slug),
    ["open-one"],
  );
});

test("a locked programme the user has unlocked is present and flagged", async () => {
  const { service } = build({
    active: [locked("gated")],
    unlocks: [{ programmeId: "gated", createdAt: new Date("2026-09-01Z") }],
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.slug, "gated");
  assert.equal(row?.locked, true);
  assert.equal(row?.unlocked, true);
});

test("an open programme is listed without any unlock record", async () => {
  const { service } = build({ active: [programme("open-one")] });

  const [row] = await service.listForUser(user);

  assert.equal(row?.locked, false);
  assert.equal(row?.unlocked, false);
});

test("a programme locked after the user started it is still shown as active", async () => {
  // Locking is a content edit and can happen mid-flight. Withholding the row
  // would strand the "currently active" treatment on a programme the user is
  // demonstrably already on.
  const { service } = build({
    active: [locked("gated")],
    activeSlug: "gated",
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.slug, "gated");
  assert.equal(row?.active, true);
});

test("eligibility refuses a locked programme the user has not unlocked", async () => {
  const { service } = build({ active: [locked("gated")] });

  assert.equal(await service.isEligible(user, "gated"), false);
});

test("eligibility allows a locked programme the user has unlocked", async () => {
  const { service } = build({
    active: [locked("gated")],
    unlocks: [{ programmeId: "gated", createdAt: new Date("2026-09-01Z") }],
  });

  assert.equal(await service.isEligible(user, "gated"), true);
});

test("an unlock for a locked programme whose mirror row is gone stays absent", async () => {
  const { service } = build({
    active: [locked("gated")],
    identities: [{ slug: "gated", sourceDocumentId: "doc-gated" }],
    unlocks: [{ programmeId: "doc-retired", createdAt: new Date() }],
  });

  assert.deepEqual(await service.listForUser(user), []);
});

test("being on a locked programme is not permission to start it", async () => {
  // The list shows the running programme so it can carry its "currently
  // active" treatment. That is a rendering rule, and it must not widen the
  // start gate: without an unlock the programme is still not startable.
  const { service } = build({
    active: [locked("gated")],
    activeSlug: "gated",
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.slug, "gated");
  assert.equal(row?.active, true);
  assert.equal(await service.isEligible(user, "gated"), false);
});

test("an open programme the user is on stays startable", async () => {
  const { service } = build({
    active: [programme("open-one")],
    activeSlug: "open-one",
  });

  assert.equal(await service.isEligible(user, "open-one"), true);
});

test("a programme above the user's plan is listed as requiring an upgrade and refused by isEligible", async () => {
  const { service } = build({
    active: [
      programme("first-take"),
      programme("brand-builder", { minimumTier: "creator" }),
    ],
  });

  const eligible = await service.listForUser(user);
  const gated = eligible.find((row) => row.slug === "brand-builder");

  assert.equal(gated?.requiresUpgrade, true);
  assert.equal(gated?.minimumTier, "creator");
  assert.equal(
    eligible.find((row) => row.slug === "first-take")?.requiresUpgrade,
    false,
  );
  assert.equal(await service.isEligible(user, "brand-builder"), false);
  assert.equal(await service.isEligible(user, "first-take"), true);
});

test("a paid plan opens the gated programme, and a higher plan opens a lower gate", async () => {
  const { service } = build({
    active: [programme("brand-builder", { minimumTier: "creator" })],
    entitlements: { tier: "pro", paid: true },
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.requiresUpgrade, false);
  assert.equal(await service.isEligible(user, "brand-builder"), true);
});

test("a programme with no authored gate is open to a free user", async () => {
  const { service } = build({ active: [programme("first-take")] });

  const [row] = await service.listForUser(user);

  assert.equal(row?.minimumTier, "free");
  assert.equal(row?.requiresUpgrade, false);
});

test("an engine unlock does not stand in for the plan a programme requires", async () => {
  // The two gates are independent: an unlock answers "may this user see it",
  // the plan answers "may this user start it". Passing one says nothing
  // about the other.
  const { service } = build({
    active: [locked("gated", { minimumTier: "creator" })],
    unlocks: [{ programmeId: "gated", createdAt: new Date("2026-09-01Z") }],
  });

  const [row] = await service.listForUser(user);

  assert.equal(row?.locked, true);
  assert.equal(row?.unlocked, true);
  assert.equal(row?.requiresUpgrade, true);
  assert.equal(await service.isEligible(user, "gated"), false);
});

test("each card carries the platforms and content types its tasks target, deduplicated", async () => {
  const { service } = build({
    active: [programme("first-take")],
    tasks: {
      "first-take": [
        { platform: "instagram", contentType: "reel" },
        { platform: "tiktok", contentType: "reel" },
        { platform: null, contentType: "carousel" },
      ],
    },
  });

  const [row] = await service.listForUser(user);

  assert.deepEqual(row?.targetPlatforms, ["instagram", "tiktok"]);
  assert.deepEqual(row?.targetContentTypes, ["carousel", "reel"]);
});

test("while a programme runs, every other card is blocked from starting", async () => {
  const { service } = build({
    active: [programme("first-take"), programme("brand-builder")],
    activeSlug: "first-take",
  });

  const rows = await service.listForUser(user);

  assert.equal(rows.find((row) => row.slug === "first-take")?.startBlockedByActive, false);
  assert.equal(rows.find((row) => row.slug === "brand-builder")?.startBlockedByActive, true);
});

test("startRefusal is the one gate: locked without an unlock, then the plan", async () => {
  const locked = programme("gated", { access: "locked" });
  const noUnlock = build({ active: [locked] });
  assert.equal(await noUnlock.service.startRefusal(user.id, locked), "locked");

  const unlocked = build({ active: [locked], unlocks: [{ programmeId: "gated", createdAt: new Date() }] });
  assert.equal(await unlocked.service.startRefusal(user.id, locked), null);

  const paid = programme("paid", { minimumTier: "pro" });
  assert.equal(await build({ active: [paid] }).service.startRefusal(user.id, paid), "requires_upgrade");
  assert.equal((await build({ active: [paid] }).service.findOffered("nope")), undefined);
});
