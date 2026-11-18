// Environment parsing shared by the config factories.
//
// These had drifted into a copy per factory. The one that matters is
// `apiPublicUrl`: better-auth's Google callback and the Instagram redirect uri
// must resolve to the same origin, and two independent derivations of it is a
// desync waiting for whoever changes the proxy story.
//
// `posthog.config.ts` deliberately keeps its own `readOptional` — it also
// strips surrounding quotes, for reasons its comment explains.

export function readOptional(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBoolean(value: string | undefined, fallback: boolean) {
  const normalised = value?.trim().toLowerCase();

  if (normalised === "true" || normalised === "1") {
    return true;
  }

  if (normalised === "false" || normalised === "0") {
    return false;
  }

  return fallback;
}

// Where the browser reaches this api. Deployed that is a prefix on the web
// origin (https://<web-host>/api-proxy) so auth cookies stay first-party;
// locally it is the api's own port.
export function apiPublicUrl() {
  return (
    readOptional(process.env.API_PUBLIC_URL) ??
    readOptional(process.env.BETTER_AUTH_URL) ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}
