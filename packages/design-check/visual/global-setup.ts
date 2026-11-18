import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COOKIE_NAME, seedPersonas } from "./seed.js";

const VISUAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(VISUAL_DIR, ".auth");
const REPO_ROOT = path.resolve(VISUAL_DIR, "../../..");

/**
 * Reads DATABASE_URL and BETTER_AUTH_SECRET the same way the api does, from
 * the repo's own env files, rather than introducing a second convention.
 */
function loadEnv(): void {
  // The api owns DATABASE_URL and BETTER_AUTH_SECRET, so its env files are the
  // authority. Repo-root files are read last so an override can sit there
  // without editing a workspace's config.
  const candidates = [
    "api/.env.local",
    "api/.env",
    "web/.env.local",
    "web/.env",
    ".env.local",
    ".env",
  ];

  for (const name of candidates) {
    const file = path.join(REPO_ROOT, name);
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key!] !== undefined) continue;
      process.env[key!] = rawValue!.trim().replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * The api is not managed by Playwright's `webServer`. If it is down, every
 * protected screen redirects to the sign-in page and the run silently produces
 * a set of identical screenshots — so this fails loudly instead.
 *
 * There is deliberately no check for the web app here: `webServer` in
 * playwright.config.ts starts it and polls /api/health before globalSetup
 * runs, so a check would be unreachable and its "start it yourself" advice
 * would be wrong.
 */
async function assertApiUp(): Promise<void> {
  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";
  const api = await fetch(apiOrigin, { method: "GET" }).catch(() => null);
  if (!api) {
    throw new Error(
      `The api is not answering at ${apiOrigin}.\n` +
        `Every protected screen would redirect to the sign-in page and the run would\n` +
        `produce a report about a screen nobody asked to review.\n` +
        `Start it with: yarn dev:api`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  loadEnv();

  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/contentual";
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. It must match the value the api signs with, or " +
        "every minted session cookie will be rejected.",
    );
  }

  await assertApiUp();

  const sessions = await seedPersonas(databaseUrl, secret);

  mkdirSync(AUTH_DIR, { recursive: true });
  for (const session of sessions) {
    const state = {
      cookies: [
        {
          name: COOKIE_NAME,
          value: session.cookieValue,
          // Cookies ignore ports, so "localhost" covers both the web app on
          // 3000 and the api on 3001.
          domain: "localhost",
          path: "/",
          expires: Math.floor(session.expiresAt.getTime() / 1000),
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    };
    writeFileSync(
      path.join(AUTH_DIR, `${session.persona.key}.json`),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  }

  writeFileSync(path.join(AUTH_DIR, "none.json"), `${JSON.stringify({ cookies: [], origins: [] }, null, 2)}\n`);
}
