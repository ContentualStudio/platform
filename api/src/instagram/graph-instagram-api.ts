import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { instagramRequest, type FetchLike } from "./instagram-http";

/**
 * The real Meta Graph adapter, for "Instagram API with Instagram Login".
 *
 * That product rather than the Facebook-Page-linked one: it needs no Facebook
 * Page, which removes the single most common reason a creator cannot connect.
 * It requires a professional (Business or Creator) account, which is a real
 * onboarding constraint the connect flow prompts around rather than blocks on.
 *
 * Only two read-only scopes are ever requested — `instagram_business_basic` and
 * `instagram_business_manage_insights`. Every additional scope adds its own
 * screencast to App Review, so asking for one we do not use is not free.
 */
export const INSTAGRAM_SCOPES = Object.freeze([
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const);

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  user_id?: string | number;
  permissions?: string;
}

interface AccountResponse {
  id?: string;
  username?: string;
  followers_count?: number;
  account_type?: string;
}

interface InsightsResponse {
  data?: {
    name?: string;
    total_value?: { value?: number };
    values?: { value?: number }[];
  }[];
}

interface MediaResponse {
  data?: {
    id?: string;
    media_type?: string;
    permalink?: string;
    timestamp?: string;
    caption?: string;
    media_url?: string;
    thumbnail_url?: string;
    like_count?: number;
    comments_count?: number;
    insights?: InsightsResponse;
  }[];
}

// Links from Meta are stored and later rendered as <img src> and <a href>, so
// only https survives ingest; anything else is stored as absent.
function httpsUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

@Injectable()
export class GraphInstagramApi implements InstagramApiPort {
  constructor(
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
    // Constructor-injected so the adapter is testable without a network, and so
    // a test can assert what was actually sent rather than trusting the shape
    // of the code. Optional because Nest cannot resolve a bare function type —
    // left unresolved it falls through to the global fetch, which is what
    // production wants anyway.
    @Optional() private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {}

  async exchangeCode(code: string): Promise<InstagramResult<InstagramAccessToken>> {
    const appId = this.setting("appId");
    const appSecret = this.setting("appSecret");

    if (!appId || !appSecret) {
      return apiFailure("invalid", "Instagram is not configured.");
    }

    // The code exchange is the one call that is form-encoded and carries the
    // app secret; everything after it is a bearer-token GET.
    const result = await instagramRequest<TokenResponse>(
      {
        url: this.setting("tokenExchangeUrl") ?? "",
        method: "POST",
        timeoutMs: this.timeoutMs(),
        form: {
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: this.setting("redirectUri") ?? "",
          code,
        },
      },
      this.fetchImpl,
    );

    return this.toToken(result, 3_600);
  }

  async exchangeForLongLived(
    shortLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>> {
    const appSecret = this.setting("appSecret");

    if (!appSecret) {
      return apiFailure("invalid", "Instagram is not configured.");
    }

    return this.tokenGrant("/access_token", shortLivedToken, {
      grant_type: "ig_exchange_token",
      client_secret: appSecret,
    });
  }

  async refreshToken(
    longLivedToken: string,
  ): Promise<InstagramResult<InstagramAccessToken>> {
    return this.tokenGrant("/refresh_access_token", longLivedToken, {
      grant_type: "ig_refresh_token",
    });
  }

  /**
   * The two 60-day grants. Same call, same expiry default; they differ only in
   * path and in whether the app secret rides along.
   *
   * The one exception to "the token travels in the Authorization header":
   * these two endpoints read the token only from the `access_token` query
   * parameter and answer "The parameter access_token is required" to a Bearer
   * header. Error strings stay safe — instagramRequest scrubs `access_token=`
   * out of anything it returns.
   */
  private async tokenGrant(
    path: string,
    accessToken: string,
    params: Record<string, string>,
  ): Promise<InstagramResult<InstagramAccessToken>> {
    return this.toToken(
      await instagramRequest<TokenResponse>(
        {
          url: this.graphUrl(path, { ...params, access_token: accessToken }),
          timeoutMs: this.timeoutMs(),
        },
        this.fetchImpl,
      ),
      60 * 24 * 3_600,
    );
  }

  async fetchAccount(accessToken: string): Promise<InstagramResult<InstagramAccount>> {
    const url = this.graphUrl("/me", {
      fields: "id,username,account_type,followers_count",
    });

    const result = await instagramRequest<AccountResponse>(
      { url, accessToken, timeoutMs: this.timeoutMs() },
      this.fetchImpl,
    );

    if (!result.ok) {
      return result;
    }

    const { id, username } = result.value;

    if (!id || !username) {
      return apiFailure("invalid", "Instagram account response had no id or username.");
    }

    return apiSuccess({
      externalAccountId: id,
      username,
      followerCount: result.value.followers_count ?? 0,
      // Meta spells these BUSINESS, CREATOR, MEDIA_CREATOR and PERSONAL. Only
      // the last one is a problem for us, so anything else is professional —
      // which also means a new professional subtype does not silently read as
      // personal and trigger a spurious "convert your account" prompt.
      accountType:
        result.value.account_type?.toUpperCase() === "PERSONAL"
          ? "personal"
          : "professional",
    });
  }

  async fetchAccountInsights(
    accessToken: string,
    accountId: string,
    range?: InsightsRange,
  ): Promise<InstagramResult<InstagramAccountInsights>> {
    // `impressions` is deprecated in v22+; `views` and `reach` are what remain.
    // `since`/`until` are Unix seconds; with them Meta totals the window
    // instead of answering for the day still in progress.
    const url = this.graphUrl(`/${accountId}/insights`, {
      metric: "reach,total_interactions,profile_links_taps,views,profile_views",
      period: "day",
      metric_type: "total_value",
      ...(range
        ? {
            since: String(Math.floor(range.since.getTime() / 1_000)),
            until: String(Math.floor(range.until.getTime() / 1_000)),
          }
        : {}),
    });

    const result = await instagramRequest<InsightsResponse>(
      { url, accessToken, timeoutMs: this.timeoutMs() },
      this.fetchImpl,
    );

    if (!result.ok) {
      return result;
    }

    const metrics = readMetrics(result.value);

    return apiSuccess({
      reach: metrics.reach ?? null,
      totalInteractions: metrics.total_interactions ?? null,
      profileLinksTaps: metrics.profile_links_taps ?? null,
      views: metrics.views ?? null,
      profileViews: metrics.profile_views ?? null,
    });
  }

  async fetchMediaWithInsights(
    accessToken: string,
  ): Promise<InstagramResult<readonly InstagramMediaMetric[]>> {
    // One request, not one per post: the media list carries each post's
    // insights inline, and a per-post fan-out would multiply a daily pull's
    // request count by the size of the user's feed.
    const result = await instagramRequest<MediaResponse>(
      { url: this.mediaUrl(true), accessToken, timeoutMs: this.timeoutMs() },
      this.fetchImpl,
    );

    if (result.ok) {
      return apiSuccess(toMediaMetrics(result.value));
    }

    // Meta refuses the whole inline request when any one post cannot serve
    // insights — notably posts published before the account became a
    // professional one ("posted before the most recent time that the user's
    // account was converted to a business account"). Rather than lose every
    // post to one old one, list the posts without insights and ask for each
    // post's insights separately, leaving the ones Meta refuses as null.
    // Meta files this under more than one error code, so any refusal falls
    // back; a dead token or an outage would fail the fallback too, so those
    // are returned as they are.
    if (result.kind === "auth" || result.kind === "transient") {
      return result;
    }

    return this.fetchMediaWithPerPostInsights(accessToken);
  }

  private async fetchMediaWithPerPostInsights(
    accessToken: string,
  ): Promise<InstagramResult<readonly InstagramMediaMetric[]>> {
    const list = await instagramRequest<MediaResponse>(
      { url: this.mediaUrl(false), accessToken, timeoutMs: this.timeoutMs() },
      this.fetchImpl,
    );

    if (!list.ok) {
      return list;
    }

    const entries = await Promise.all(
      (list.value.data ?? []).map(async (entry) => {
        if (!entry.id) {
          return entry;
        }

        const insights = await instagramRequest<InsightsResponse>(
          {
            url: this.graphUrl(`/${entry.id}/insights`, { metric: MEDIA_METRICS }),
            accessToken,
            timeoutMs: this.timeoutMs(),
          },
          this.fetchImpl,
        );

        // A post Meta will not report on keeps its likes and comments, and its
        // insight metrics stay null rather than reading as zero.
        return insights.ok ? { ...entry, insights: insights.value } : entry;
      }),
    );

    return apiSuccess(toMediaMetrics({ data: entries }));
  }

  private mediaUrl(withInsights: boolean) {
    return this.graphUrl("/me/media", {
      fields:
        "id,media_type,permalink,timestamp,caption,media_url,thumbnail_url," +
        "like_count,comments_count" +
        (withInsights ? `,insights.metric(${MEDIA_METRICS})` : ""),
      limit: "25",
    });
  }

  async revoke(accessToken: string): Promise<InstagramResult<void>> {
    const result = await instagramRequest<unknown>(
      {
        url: this.graphUrl("/me/permissions", {}),
        method: "DELETE",
        accessToken,
        timeoutMs: this.timeoutMs(),
      },
      this.fetchImpl,
    );

    return result.ok ? apiSuccess(undefined) : result;
  }

  private toToken(
    result: InstagramResult<TokenResponse>,
    fallbackExpiry: number,
  ): InstagramResult<InstagramAccessToken> {
    if (!result.ok) {
      return result;
    }

    const accessToken = result.value.access_token;

    if (!accessToken) {
      return apiFailure("invalid", "Instagram token response carried no token.");
    }

    return apiSuccess({
      accessToken,
      expiresInSeconds: result.value.expires_in ?? fallbackExpiry,
      userId:
        result.value.user_id === undefined ? undefined : String(result.value.user_id),
    });
  }

  private graphUrl(path: string, params: Record<string, string>): string {
    const base = this.setting("graphBaseUrl") ?? "https://graph.instagram.com";
    const url = new URL(`${base.replace(/\/$/, "")}${path}`);

    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }

    return url.toString();
  }

  private setting(name: string): string | undefined {
    return this.config?.get<string>(`instagram.${name}`);
  }

  private timeoutMs(): number {
    return this.config?.get<number>("instagram.httpTimeoutMs") ?? 10_000;
  }
}

// Insights come back as a list of named metrics, each carrying either a
// `total_value` or a `values` series depending on the metric type. Flattening
// to a name -> number map here keeps that shape out of every caller.
const MEDIA_METRICS = "views,reach,shares,saved";

function toMediaMetrics(response: MediaResponse): InstagramMediaMetric[] {
  return (response.data ?? [])
    .filter((entry): entry is { id: string } & typeof entry => Boolean(entry.id))
    .map((entry) => {
      const metrics = readMetrics(entry.insights ?? {});

      return {
        mediaId: entry.id,
        mediaType: entry.media_type ?? null,
        permalink: httpsUrl(entry.permalink),
        postedAt: entry.timestamp ? new Date(entry.timestamp) : null,
        caption: entry.caption ?? null,
        // A video's media_url is the video file; its image is thumbnail_url.
        thumbnailUrl: httpsUrl(
          entry.thumbnail_url ?? (entry.media_type === "VIDEO" ? undefined : entry.media_url),
        ),
        // A metric Meta did not return stays null. Defaulting to zero would
        // read as "nobody viewed this", which is a different claim.
        views: metrics.views ?? null,
        reach: metrics.reach ?? null,
        likes: entry.like_count ?? null,
        comments: entry.comments_count ?? null,
        shares: metrics.shares ?? null,
        saved: metrics.saved ?? null,
      };
    });
}

function readMetrics(response: InsightsResponse): Record<string, number | undefined> {
  const metrics: Record<string, number | undefined> = {};

  for (const entry of response.data ?? []) {
    if (!entry.name) {
      continue;
    }

    metrics[entry.name] =
      entry.total_value?.value ?? entry.values?.[0]?.value ?? undefined;
  }

  return metrics;
}
