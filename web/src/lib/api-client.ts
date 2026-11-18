/**
 * Browser-facing api origin. In deployed environments this points at a path on
 * the web origin (`/api-proxy`, rewritten to the api in `next.config.ts`) so
 * Better Auth's session cookie is set first-party on the web domain — a cookie
 * set on a separate api host is invisible to Server Components, which is what
 * bounced every post-login navigation back to `/auth/sign`.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

/**
 * Server-side api origin. Server Components already forward the cookie header
 * by hand, so they skip the proxy hop and call the api directly. Falls back to
 * the public url for local development, where both run on `localhost` and are
 * therefore same-site anyway.
 */
export const serverApiBaseUrl = process.env.API_ORIGIN ?? apiBaseUrl;

/**
 * A server-side read of the api as the signed-in user.
 *
 * Forwards the request's cookies, returns null rather than throwing when the
 * api refuses, and validates the body. Server components each wrap this in
 * React's `cache()` so a layout and the page it renders share one request.
 */
export async function serverApiGet<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
): Promise<T | null> {
  const { cookies } = await import("next/headers");
  const cookieHeader = (await cookies()).toString();

  const response = await fetch(`${serverApiBaseUrl}${path}`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  // Nest sends a controller's `null` as a 200 with an empty body, not the
  // four characters "null", so `response.json()` throws "Unexpected end of
  // JSON input" on every legitimate no-value read — /programmes/current for a
  // user between programmes, which is what broke the dashboard. An empty body
  // is that absent value; hand it to the schema as null.
  const body = await response.text();

  return schema.parse(body === "" ? null : JSON.parse(body));
}

/**
 * `serverApiGet` for reads where "no value" is not a real answer: a failure
 * throws, so the section's RetryBoundary shows error-and-retry rather than an
 * empty state that would read as "you have nothing yet".
 */
export async function serverApiGetOrThrow<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  message: string,
): Promise<T> {
  const value = await serverApiGet(path, schema);

  if (value === null) {
    throw new Error(message);
  }

  return value;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  const rawPayload = await response.json().catch(() => ({}));

  return { response, rawPayload };
}
