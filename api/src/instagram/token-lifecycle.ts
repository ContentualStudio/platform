// The rules that decide what to do with a stored Instagram token, expressed as
// pure functions over timestamps.
//
// Pure, and taking `now` as a parameter rather than reading the clock, because
// every one of these is a boundary condition — exactly 24 hours, exactly 90
// days, expiring during the run — and a rule that reads its own clock can only
// be tested by waiting.

/** Meta's long-lived tokens last 60 days and may be refreshed once a day. */
export const refreshEligibleAfterMs = 24 * 60 * 60_000;

/**
 * Meta revokes a permission that has gone unused for 90 days, which needs a
 * fresh grant from the user rather than a refresh. We surface it as
 * reconnect_required *before* it bites, so the failure is a prompt rather than
 * a broken pull.
 */
export const permissionStaleAfterMs = 90 * 24 * 60 * 60_000;

export interface TokenTimestamps {
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly lastRefreshedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

export type ConnectionStatus = "connected" | "reconnect_required" | "disconnected";

/**
 * Whether the token is old enough for Meta to accept a refresh.
 *
 * Age counts from the last refresh, falling back to issue: a token refreshed an
 * hour ago is an hour old however long ago it was first granted.
 */
export function isRefreshEligible(token: TokenTimestamps, now: Date): boolean {
  const age = now.getTime() - (token.lastRefreshedAt ?? token.issuedAt).getTime();

  return age >= refreshEligibleAfterMs;
}

export function isExpired(token: TokenTimestamps, now: Date): boolean {
  return token.expiresAt.getTime() <= now.getTime();
}

/**
 * Whether a granted permission has gone unused long enough that Meta will want
 * a fresh grant.
 *
 * Falls back to issue time when the token has never been used, which is the
 * honest reading: an unused permission's clock starts when it was granted.
 */
export function isPermissionStale(token: TokenTimestamps, now: Date): boolean {
  const idle = now.getTime() - (token.lastUsedAt ?? token.issuedAt).getTime();

  return idle >= permissionStaleAfterMs;
}

/**
 * What the connection's status should be, given its token.
 *
 * Only ever returns `connected` or `reconnect_required`: `disconnected` is a
 * decision the user or Meta makes, never one derived from a timestamp.
 */
export function resolveStatus(
  token: TokenTimestamps,
  now: Date,
): Extract<ConnectionStatus, "connected" | "reconnect_required"> {
  return isExpired(token, now) || isPermissionStale(token, now)
    ? "reconnect_required"
    : "connected";
}
