/**
 * The seam onto Meta's Graph API.
 *
 * Separate from `InstagramGraphPort` rather than replacing it. That port is
 * what `InstagramService` calls, and every emit gate, stable event id and
 * existing test in this module sits behind it — widening it would put all of
 * that at risk to gain nothing. This port sits one layer lower: it speaks HTTP
 * to Meta, and `TokenBackedInstagramGraph` adapts it up to the old shape.
 *
 * Failures are returned, not thrown, in the shape `email.service.ts` already
 * established for outbound calls — but classified, because unlike an email
 * these failures steer connection status:
 *
 *   - `auth`        the token is expired, revoked, or the permission lapsed.
 *                   The connection needs a fresh grant: reconnect_required.
 *   - `permission`  the account cannot serve this metric — it is personal, or
 *                   under the 100-follower gate. Degrade, do not error.
 *   - `transient`   network, 429, or 5xx. Tomorrow's run is the retry.
 *   - `invalid`     a request we should not have made. A bug, not a state.
 */
export const INSTAGRAM_API = Symbol("INSTAGRAM_API");

export type InstagramFailureKind =
  | "auth"
  | "permission"
  | "transient"
  | "invalid";

export interface InstagramFailure {
  readonly ok: false;
  readonly kind: InstagramFailureKind;
  readonly statusCode?: number;
  /** Always scrubbed of token-shaped text before it reaches here. */
  readonly error: string;
}

export interface InstagramSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type InstagramResult<T> = InstagramSuccess<T> | InstagramFailure;

export interface InstagramAccessToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  /** Meta's own id for the account the token belongs to. */
  readonly userId?: string;
}

export interface InstagramAccount {
  readonly externalAccountId: string;
  readonly username: string;
  readonly followerCount: number;
  readonly accountType: "professional" | "personal";
}

/**
 * Account-level insights.
 *
 * Every field is nullable because absence is a normal outcome, not a failure:
 * `impressions` is deprecated in favour of `views`, and an account under 100
 * followers is refused the demographic metrics outright.
 */
/**
 * A completed window to read account insights for, e.g. one local day.
 * Without one Meta answers for the day still in progress, which reads as
 * near-zero for most of it.
 */
export interface InsightsRange {
  readonly since: Date;
  readonly until: Date;
}

export interface InstagramAccountInsights {
  readonly reach: number | null;
  readonly totalInteractions: number | null;
  readonly profileLinksTaps: number | null;
  /** Times the account's content was seen; Meta's successor to impressions. */
  readonly views: number | null;
  readonly profileViews: number | null;
}

export interface InstagramMediaMetric {
  readonly mediaId: string;
  readonly mediaType: string | null;
  readonly permalink: string | null;
  readonly postedAt: Date | null;
  readonly caption: string | null;
  /** An image of the post: the cover frame for a video, else the media itself. */
  readonly thumbnailUrl: string | null;
  readonly views: number | null;
  readonly reach: number | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly shares: number | null;
  readonly saved: number | null;
}

export interface InstagramApiPort {
  /** Authorization code -> short-lived (1 hour) token. */
  exchangeCode(code: string): Promise<InstagramResult<InstagramAccessToken>>;

  /** Short-lived -> long-lived (60 day) token, via ig_exchange_token. */
  exchangeForLongLived(
    shortLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>>;

  /** Long-lived -> a fresh 60 days, via ig_refresh_token. Needs a token >= 24h old. */
  refreshToken(
    longLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>>;

  fetchAccount(accessToken: string): Promise<InstagramResult<InstagramAccount>>;

  fetchAccountInsights(
    accessToken: string,
    accountId: string,
    range?: InsightsRange,
  ): Promise<InstagramResult<InstagramAccountInsights>>;

  fetchMediaWithInsights(
    accessToken: string,
  ): Promise<InstagramResult<readonly InstagramMediaMetric[]>>;

  /** Best effort: Meta does not reliably offer revocation on Instagram Login. */
  revoke(accessToken: string): Promise<InstagramResult<void>>;
}

export function apiSuccess<T>(value: T): InstagramSuccess<T> {
  return { ok: true, value };
}

export function apiFailure(
  kind: InstagramFailureKind,
  error: string,
  statusCode?: number,
): InstagramFailure {
  return { ok: false, kind, error, statusCode };
}
