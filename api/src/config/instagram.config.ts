// Instagram (Meta Graph API) settings. Every value here is optional: with no
// Meta app provisioned the module binds its stubs instead, so local dev and the
// test suites never need real credentials. `configured` is the single flag the
// rest of the integration reads to decide which world it is in.

import {
  apiPublicUrl,
  parseBoolean,
  parsePositiveInt,
  readOptional,
} from "./env";

// Hours are 0-23, and 0 is a legitimate value — `parsePositiveInt` would
// reject midnight and silently serve everyone at 7am instead.
function parseHour(value: string | undefined, fallback: number) {
  // `Number("")` is 0, which is a valid hour — so an unset variable would read
  // as midnight rather than as absent.
  const raw = readOptional(value);

  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : fallback;
}

// AES-256 needs exactly 32 bytes. A short key is a configuration mistake that
// would otherwise surface as a crash on the first connect, so it is rejected
// here and reported as "not configured" — which keeps the stub bound rather
// than half-enabling an integration that cannot store a token.
export function parseEncryptionKey(value?: string): Buffer | undefined {
  const encoded = readOptional(value);

  if (!encoded) {
    return undefined;
  }

  const key = Buffer.from(encoded, "base64");

  return key.length === 32 ? key : undefined;
}

export default () => {
  // Shared with auth.config.ts, because the Instagram redirect uri has to
  // survive the same /api-proxy prefix the Google callback does.
  const publicUrl = apiPublicUrl();

  const appId = readOptional(process.env.INSTAGRAM_APP_ID);
  const appSecret = readOptional(process.env.INSTAGRAM_APP_SECRET);
  const tokenKey = parseEncryptionKey(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY);

  return {
    // Not nested under `instagram`: the sweep is a platform capability whose
    // first consumer happens to be Instagram. The 7am notification job will
    // register alongside it rather than growing a second scheduler.
    scheduling: {
      // The sweep's on/off switch belongs here, not under `instagram`. Reading
      // it from a feature namespace would mean turning Instagram off silently
      // disables the 7am notification job that registers alongside it.
      enabled: parseBoolean(process.env.DAILY_LOCAL_SWEEP_ENABLED, false),
      pollMs: parsePositiveInt(process.env.DAILY_LOCAL_SWEEP_POLL_MS, 60_000),
      localHour: parseHour(process.env.DAILY_LOCAL_SWEEP_HOUR, 7),
    },
    instagram: {
      appId,
      appSecret,
      tokenKey,
      tokenKeyId: readOptional(process.env.INSTAGRAM_TOKEN_KEY_ID) ?? "v1",
      // All three are required together. Any one missing keeps the stubs bound:
      // an app id with no key could authorise a user and then fail to store the
      // token it was granted, which is worse than not offering the flow.
      configured: Boolean(appId && appSecret && tokenKey),
      graphBaseUrl:
        readOptional(process.env.INSTAGRAM_GRAPH_BASE_URL) ??
        "https://graph.instagram.com",
      oauthBaseUrl:
        readOptional(process.env.INSTAGRAM_OAUTH_BASE_URL) ??
        "https://www.instagram.com",
      tokenExchangeUrl:
        readOptional(process.env.INSTAGRAM_TOKEN_EXCHANGE_URL) ??
        "https://api.instagram.com/oauth/access_token",
      redirectUri: `${publicUrl}/instagram/oauth/callback`,
      httpTimeoutMs: parsePositiveInt(process.env.INSTAGRAM_HTTP_TIMEOUT_MS, 10_000),
      // How long a minted OAuth `state` stays usable. Long enough to log into
      // Instagram, short enough that a leaked redirect is not a standing key.
      oauthStateTtlMs: parsePositiveInt(
        process.env.INSTAGRAM_OAUTH_STATE_TTL_MS,
        10 * 60_000,
      ),
      deletionSlaDays: parsePositiveInt(process.env.INSTAGRAM_DELETION_SLA_DAYS, 7),
    },
  };
};
