function readOptional(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The internal admin's own auth instance.
 *
 * Separate secret, cookie prefix and tables from the product's Better Auth, so
 * a product session can never be read as an admin one and rotating either
 * secret signs out only its own side. Sessions are deliberately short: the
 * admin sees every user's data, so a forgotten laptop should not stay in for
 * the product's default week.
 */
export default () => {
  const publicUrl = (
    readOptional(process.env.API_PUBLIC_URL) ??
    readOptional(process.env.BETTER_AUTH_URL) ??
    "http://localhost:3001"
  ).replace(/\/$/, "");

  return {
    adminAuth: {
      // Never served — the admin instance's router is not mounted — but
      // Better Auth derives cookie and origin checks from it.
      baseUrl: `${publicUrl}/api/admin-auth`,
      secret: readOptional(process.env.ADMIN_AUTH_SECRET),
      sessionHours: parsePositiveInt(process.env.ADMIN_SESSION_HOURS, 12),
      // Codes per email per minute; over the limit answers 429.
      resendMax: parsePositiveInt(process.env.ADMIN_AUTH_RESEND_MAX, 3),
      // "Is this an admin?" checks per client IP per ten minutes.
      lookupMaxPerIp: parsePositiveInt(process.env.ADMIN_AUTH_LOOKUP_MAX, 10),
    },
  };
};
