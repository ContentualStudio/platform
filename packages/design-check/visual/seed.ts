import { webcrypto as crypto } from "node:crypto";

import { Client } from "pg";

/**
 * Seeds the four personas the visual pass needs and mints a real session
 * cookie for each, by writing directly to Postgres.
 *
 * No production code is touched and no dev-only endpoint is added: the app
 * cannot tell these sessions from ones created by signing in. The cookie is
 * Better Auth's signed form, which `better-call` produces as
 * `encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token)))`.
 *
 * The `better-auth.session_data` cache cookie is deliberately NOT forged. Its
 * absence means "unknown, not logged out", so the api falls back to a database
 * lookup — correct behaviour, and one fewer thing to fake.
 */

export const COOKIE_NAME = "better-auth.session_token";

export interface Persona {
  key: string;
  email: string;
  name: string;
  /** What this persona exists to make reachable. */
  unlocks: string;
  onboarded: boolean;
  setup: null | {
    completed: boolean;
    assignedProgrammeId: string | null;
    started: boolean;
  };
}

/**
 * Programmes are mirrored into Postgres from the CMS, so a machine that has
 * never run a content sync has an empty `programme` table — and then
 * `assignedProgramme` resolves to null, and the screens behind it redirect
 * away. Seeding one fixture programme makes the visual pass self-sufficient
 * rather than dependent on a sync having happened first.
 */
const FIXTURE_PROGRAMME = {
  id: "design-check-30-day-foundation",
  slug: "30-day-foundation",
  title: "30-Day Foundation",
  description: "Build the habit of posting consistently, one day at a time.",
  durationDays: 30,
};

/**
 * The stage gate in web/src/lib/stage-gate.ts is a ladder, and each rung
 * redirects away from the ones below it. One user therefore cannot reach all
 * the gated screens — /onboarding redirects once onboarding is complete,
 * /challenge-setup redirects once the programme has started, and
 * /challenge-setup/welcome redirects both when it has started and when no
 * programme is assigned. Hence four.
 */
export const PERSONAS: Persona[] = [
  {
    key: "fresh",
    email: "design-fresh@contentual.test",
    name: "Design Fresh",
    unlocks: "/onboarding",
    onboarded: false,
    setup: null,
  },
  {
    key: "setup",
    email: "design-setup@contentual.test",
    name: "Design Setup",
    unlocks: "/challenge-setup",
    onboarded: true,
    setup: null,
  },
  {
    key: "welcome",
    email: "design-welcome@contentual.test",
    name: "Design Welcome",
    unlocks: "/challenge-setup/welcome",
    onboarded: true,
    setup: { completed: true, assignedProgrammeId: "30-day-foundation", started: false },
  },
  {
    key: "active",
    email: "design-active@contentual.test",
    name: "Design Active",
    unlocks: "the dashboard and everything behind it",
    onboarded: true,
    setup: { completed: true, assignedProgrammeId: FIXTURE_PROGRAMME.slug, started: true },
  },
];

/**
 * Refuses to touch a database that is not obviously local.
 *
 * The seeder writes rows. A mistyped DATABASE_URL would otherwise put test
 * users into a real database, so this is a hard stop rather than a warning.
 */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  const isLoopback = ["localhost", "127.0.0.1", "::1", ""].includes(host);

  if (!isLoopback && process.env.DESIGN_CHECK_ALLOW_REMOTE_DB !== "1") {
    throw new Error(
      `Refusing to seed test users into a non-local database (host "${host}").\n` +
        `The visual check writes rows. If this really is a disposable database, set\n` +
        `DESIGN_CHECK_ALLOW_REMOTE_DB=1 to override.`,
    );
  }
}

async function signCookie(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const encoded = Buffer.from(signature).toString("base64");
  return encodeURIComponent(`${value}.${encoded}`);
}

export interface SeededSession {
  persona: Persona;
  cookieValue: string;
  expiresAt: Date;
}

export async function seedPersonas(
  databaseUrl: string,
  secret: string,
): Promise<SeededSession[]> {
  assertLocalDatabase(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const out: SeededSession[] = [];
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO programme ("sourceDocumentId", "sourceUpdatedAt", "publishedAt", slug,
         title, description, "durationDays", "experienceLevel", difficulty, track,
         "ctaText", expectations, milestones, "insightMoments")
       VALUES ($1, now(), now(), $2, $3, $4, $5, 'intermediate', 'steady', 'consistency',
         'Start the challenge', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title`,
      [
        FIXTURE_PROGRAMME.id,
        FIXTURE_PROGRAMME.slug,
        FIXTURE_PROGRAMME.title,
        FIXTURE_PROGRAMME.description,
        FIXTURE_PROGRAMME.durationDays,
      ],
    );

    for (const persona of PERSONAS) {
      // Idempotent: remove any previous run's rows first, in the same cascade
      // order as api/src/scripts/reset-test-user.ts.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE email = $1`,
        [persona.email],
      );
      for (const row of existing.rows) {
        await client.query(`DELETE FROM challenge_setup WHERE "userId" = $1`, [row.id]);
        await client.query(`DELETE FROM user_profile WHERE "userId" = $1`, [row.id]);
        await client.query(`DELETE FROM session WHERE "userId" = $1`, [row.id]);
        await client.query(`DELETE FROM account WHERE "userId" = $1`, [row.id]);
        await client.query(`DELETE FROM "user" WHERE id = $1`, [row.id]);
      }

      const userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
        [userId, persona.name, persona.email],
      );

      await client.query(
        `INSERT INTO user_profile ("userId", "onboardingCompletedAt", "userType", region,
           timezone, platforms, "experienceLevel", "postingFrequency", "mainGoal",
           "biggestChallenge", bio)
         VALUES ($1, $2, 'creator', 'GB', 'Europe/London', ARRAY['instagram','tiktok'],
           'intermediate', 'weekly', 'grow-audience', 'consistency',
           'Design-check fixture account.')`,
        [userId, persona.onboarded ? new Date() : null],
      );

      if (persona.setup) {
        const now = Date.now();
        await client.query(
          `INSERT INTO challenge_setup ("userId", platforms, "postingGoal", "weeklyCommitment",
             "nicheDefined", "contentType", "followerRange", "instagramConnected", milestone,
             "availableDays", "sawTestimonial", "setupCompletedAt", "assignedProgrammeId",
             "programmeAssignedAt", "programmeStartedAt", "day1ScheduledFor")
           VALUES ($1, ARRAY['instagram'], 'consistency', 4, 'yes', 'video', '1k-10k', false,
             'first-1k', ARRAY['mon','tue','wed','thu'], true, $2, $3, $4, $5, $6)`,
          [
            userId,
            persona.setup.completed ? new Date(now) : null,
            persona.setup.assignedProgrammeId,
            persona.setup.assignedProgrammeId ? new Date(now) : null,
            persona.setup.started ? new Date(now) : null,
            // Three days ago, so the dashboard renders day 4 of 30 — a
            // populated programme rather than an empty first-day state, which
            // is the screen actually worth reviewing.
            persona.setup.started ? new Date(now - 3 * 86_400_000) : null,
          ],
        );
      }

      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      await client.query(
        `INSERT INTO session (id, token, "expiresAt", "userId", "ipAddress", "userAgent")
         VALUES ($1, $2, $3, $4, '127.0.0.1', 'contentual-design-check')`,
        [crypto.randomUUID(), token, expiresAt, userId],
      );

      out.push({ persona, cookieValue: await signCookie(token, secret), expiresAt });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  return out;
}
