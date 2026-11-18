import { Injectable } from "@nestjs/common";
import {
  apiFailure,
  apiSuccess,
  type InstagramAccessToken,
  type InstagramAccount,
  type InsightsRange,
  type InstagramAccountInsights,
  type InstagramApiPort,
  type InstagramMediaMetric,
  type InstagramResult,
} from "./instagram-api.port";

/**
 * Internal stand-in for Meta's Graph API — not a real integration.
 *
 * This is what makes the whole Instagram feature runnable, demonstrable and
 * testable with no Meta app provisioned, which is the state the project is
 * actually in: app review is a multi-week pipeline, and the rest of the product
 * cannot wait on it.
 *
 * Deterministic and stateless, in the spirit of StubInstagramGraph. The
 * authorization "code" carries the account it should produce, so a caller can
 * drive any scenario — personal account, sub-100 followers, an exact milestone
 * crossing — without a stub that remembers state between calls:
 *
 *     handle                       professional, 0 followers
 *     handle:1200                  professional, 1200 followers
 *     handle:50:personal           personal, 50 followers
 *
 * Tokens are minted as `stub-token:<handle>:<count>:<type>` so every later call
 * can recover the account from the token alone — again, no stored state.
 */
@Injectable()
export class StubInstagramApi implements InstagramApiPort {
  async exchangeCode(code: string): Promise<InstagramResult<InstagramAccessToken>> {
    const account = parseDescriptor(code);

    if (!account) {
      return apiFailure("invalid", "Stub authorization code must name a handle.");
    }

    // One hour, matching the real short-lived token, so a caller that forgets
    // to exchange it hits the same wall it would in production.
    return apiSuccess({
      accessToken: mintToken(account),
      expiresInSeconds: 3_600,
      userId: account.externalAccountId,
    });
  }

  async exchangeForLongLived(
    shortLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>> {
    const account = parseToken(shortLivedToken);

    if (!account) {
      return apiFailure("auth", "Stub token is not recognised.");
    }

    return apiSuccess({
      accessToken: mintToken(account),
      expiresInSeconds: 60 * 24 * 3_600,
      userId: account.externalAccountId,
    });
  }

  async refreshToken(
    longLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>> {
    const account = parseToken(longLivedToken);

    if (!account) {
      return apiFailure("auth", "Stub token is not recognised.");
    }

    return apiSuccess({
      accessToken: mintToken(account),
      expiresInSeconds: 60 * 24 * 3_600,
    });
  }

  async fetchAccount(accessToken: string): Promise<InstagramResult<InstagramAccount>> {
    const account = parseToken(accessToken);

    return account
      ? apiSuccess(account)
      : apiFailure("auth", "Stub token is not recognised.");
  }

  // `accountId` is unused here but kept in the signature: the real adapter
  // addresses `/{ig-user-id}/insights` with it, and a stub that quietly took
  // fewer arguments would let a caller omit it and only find out in production.
  async fetchAccountInsights(
    accessToken: string,
    _accountId: string,
    _range?: InsightsRange,
  ): Promise<InstagramResult<InstagramAccountInsights>> {
    const account = parseToken(accessToken);

    if (!account) {
      return apiFailure("auth", "Stub token is not recognised.");
    }

    // The two real gates, reproduced so the degradation paths are exercisable
    // without a Meta app: a personal account serves no insights at all, and an
    // account under 100 followers is refused the gated metrics.
    if (account.accountType === "personal") {
      return apiFailure("permission", "Insights need a professional account.");
    }

    if (account.followerCount < 100) {
      return apiFailure("permission", "Insights need at least 100 followers.");
    }

    return apiSuccess({
      reach: Math.round(account.followerCount * 0.6),
      totalInteractions: Math.round(account.followerCount * 0.1),
      profileLinksTaps: Math.round(account.followerCount * 0.01),
      views: Math.round(account.followerCount * 1.5),
      profileViews: Math.round(account.followerCount * 0.05),
    });
  }

  async fetchMediaWithInsights(
    accessToken: string,
  ): Promise<InstagramResult<readonly InstagramMediaMetric[]>> {
    const account = parseToken(accessToken);

    if (!account) {
      return apiFailure("auth", "Stub token is not recognised.");
    }

    if (account.accountType === "personal") {
      return apiFailure("permission", "Media insights need a professional account.");
    }

    // Three posts, derived from the follower count so the numbers move when the
    // caller changes the scenario. Dates are fixed offsets from the epoch
    // rather than from now(), so a snapshot test of this stub is stable.
    return apiSuccess(
      [0, 1, 2].map((index) => ({
        mediaId: `${account.externalAccountId}-media-${index}`,
        mediaType: index === 0 ? "REELS" : "IMAGE",
        permalink: `https://www.instagram.com/p/stub-${index}/`,
        postedAt: new Date(Date.UTC(2026, 0, 1 + index)),
        // One post without a caption or image, so the fallbacks get exercised.
        caption: index === 1 ? null : `Stub post ${index + 1}`,
        thumbnailUrl: index === 1 ? null : `https://picsum.photos/seed/stub-${index}/96`,
        views: account.followerCount * (index + 1),
        reach: Math.round(account.followerCount * 0.6),
        likes: Math.round(account.followerCount * 0.05),
        comments: index,
        shares: index,
        // Deliberately absent on one post: a missing metric is a normal outcome
        // and must be stored as null rather than invented as zero.
        saved: index === 2 ? null : index,
      })),
    );
  }

  async revoke(accessToken: string): Promise<InstagramResult<void>> {
    return parseToken(accessToken)
      ? apiSuccess(undefined)
      : apiFailure("auth", "Stub token is not recognised.");
  }
}

const tokenPrefix = "stub-token";

function mintToken(account: InstagramAccount): string {
  return [
    tokenPrefix,
    account.username,
    account.followerCount,
    account.accountType,
  ].join(":");
}

function parseToken(token: string): InstagramAccount | null {
  const [prefix, ...rest] = token.split(":");

  return prefix === tokenPrefix ? parseDescriptor(rest.join(":")) : null;
}

function parseDescriptor(descriptor: string): InstagramAccount | null {
  const [handle, countText, typeText] = descriptor.split(":");
  const username = handle?.trim();

  if (!username) {
    return null;
  }

  const followerCount = countText ? Number(countText) : 0;

  if (!Number.isFinite(followerCount) || followerCount < 0) {
    return null;
  }

  return {
    externalAccountId: `stub:${username}`,
    username,
    followerCount,
    accountType: typeText === "personal" ? "personal" : "professional",
  };
}
