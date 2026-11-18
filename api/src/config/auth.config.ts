function readOptional(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function parseCsv(value?: string) {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items && items.length > 0 ? items : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => {
  const webOrigin =
    readOptional(process.env.WEB_ORIGIN) ?? "http://localhost:3000";
  const googleClientId = readOptional(process.env.GOOGLE_CLIENT_ID);
  const googleClientSecret = readOptional(process.env.GOOGLE_CLIENT_SECRET);
  // Where the browser reaches this api. Deployed that is a prefix on the web
  // origin (https://<web-host>/api-proxy) so auth cookies stay first-party;
  // locally it is the api's own port.
  const publicUrl = (
    readOptional(process.env.API_PUBLIC_URL) ??
    readOptional(process.env.BETTER_AUTH_URL) ??
    "http://localhost:3001"
  ).replace(/\/$/, "");

  return {
    auth: {
      allowedAttempts: parsePositiveInt(
        process.env.AUTH_EMAIL_OTP_ALLOWED_ATTEMPTS,
        3,
      ),
      // Better Auth's `withPath` only appends the default `/api/auth` base
      // path when the configured url has no path of its own. With a proxy
      // prefix it would stop appending, and the Google redirect uri would
      // collapse to `<prefix>/callback/google` — a path the api doesn't
      // serve. Spell the mount point out so both cases agree.
      baseUrl: `${publicUrl}/api/auth`,
      publicUrl,
      emailOtpExpiresSeconds: parsePositiveInt(
        process.env.AUTH_EMAIL_OTP_EXPIRES_SECONDS,
        300,
      ),
      resendRateLimitMax: parsePositiveInt(
        process.env.AUTH_EMAIL_OTP_RESEND_MAX,
        3,
      ),
      resendRateLimitWindowSeconds: parsePositiveInt(
        process.env.AUTH_EMAIL_OTP_RESEND_WINDOW_SECONDS,
        60,
      ),
      secret: readOptional(process.env.BETTER_AUTH_SECRET),
      trustedOrigins: parseCsv(process.env.BETTER_AUTH_TRUSTED_ORIGINS) ?? [
        webOrigin,
      ],
      webOrigin,
      google:
        googleClientId && googleClientSecret
          ? {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            }
          : undefined,
    },
  };
};
