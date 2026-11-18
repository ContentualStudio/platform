import { getCookieCache } from "better-auth/cookies";

export interface CachedSession {
  onboardingCompleted: boolean;
  user: { id: string; email: string; name: string };
}

// Reads better-auth's short-lived, signed session cookie cache with no DB
// or network call. A `null` result means "unknown," not "logged out" — the
// cache expires well before the underlying session does, so callers must
// fall back to an authoritative check rather than treat this as a denial.
export async function getCachedSession(
  source: Request | Headers,
): Promise<CachedSession | null> {
  const session = await getCookieCache(source, {
    secret: process.env.BETTER_AUTH_SECRET,
  });

  return (session as unknown as CachedSession | null) ?? null;
}
