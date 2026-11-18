import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import { GraphInstagramApi, INSTAGRAM_SCOPES } from "./graph-instagram-api";
import type { FetchLike } from "./instagram-http";

const settings: Record<string, unknown> = {
  "instagram.appId": "app-id",
  "instagram.appSecret": "app-secret",
  "instagram.graphBaseUrl": "https://graph.instagram.com",
  "instagram.tokenExchangeUrl": "https://api.instagram.com/oauth/access_token",
  "instagram.redirectUri": "https://web.example.com/api-proxy/instagram/oauth/callback",
  "instagram.httpTimeoutMs": 5_000,
};

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function build(
  responses: readonly { status?: number; body: unknown }[],
): { api: GraphInstagramApi; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;

  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    const next = responses[Math.min(index++, responses.length - 1)];

    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      json: async () => next.body,
    } as Response;
  }) as unknown as FetchLike;

  const config = {
    get: (path: string) => settings[path],
  } as unknown as ConfigService;

  return { api: new GraphInstagramApi(config, fetchImpl), calls };
}

test("only the two read-only scopes are ever named", () => {
  assert.deepEqual([...INSTAGRAM_SCOPES], [
    "instagram_business_basic",
    "instagram_business_manage_insights",
  ]);
});

// The token goes in a header, never a query string: a url reaches upstream
// access logs we do not control.
test("the access token travels in a header, never in the url", async () => {
  const { api, calls } = build([
    { body: { id: "1", username: "creator", followers_count: 10 } },
  ]);

  await api.fetchAccount("secret-token-value");

  assert.ok(!calls[0].url.includes("secret-token-value"));
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer secret-token-value",
  );
});

test("an account response maps to the domain shape", async () => {
  const { api } = build([
    {
      body: {
        id: "ig-99",
        username: "creator",
        followers_count: 1200,
        account_type: "BUSINESS",
      },
    },
  ]);

  const result = await api.fetchAccount("token");

  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    externalAccountId: "ig-99",
    username: "creator",
    followerCount: 1200,
    accountType: "professional",
  });
});

test("only PERSONAL reads as personal, so a new subtype is not mistaken for it", async () => {
  for (const [accountType, expected] of [
    ["PERSONAL", "personal"],
    ["CREATOR", "professional"],
    ["MEDIA_CREATOR", "professional"],
    [undefined, "professional"],
  ] as const) {
    const { api } = build([
      { body: { id: "1", username: "c", account_type: accountType } },
    ]);

    const result = await api.fetchAccount("token");

    assert.ok(result.ok);
    assert.equal(result.value.accountType, expected);
  }
});

test("a dead token is classified as auth so the connection can be flagged", async () => {
  const { api } = build([
    { status: 400, body: { error: { code: 190, message: "Session expired" } } },
  ]);

  const result = await api.fetchAccount("token");

  assert.ok(!result.ok);
  assert.equal(result.kind, "auth");
});

// Not an error: the account genuinely cannot serve this metric, and the pull
// must degrade rather than fail the whole run.
test("a permission refusal is classified separately from an auth failure", async () => {
  const { api } = build([
    { status: 400, body: { error: { code: 10, message: "Not enough followers" } } },
  ]);

  const result = await api.fetchAccountInsights("token", "ig-1");

  assert.ok(!result.ok);
  assert.equal(result.kind, "permission");
});

test("throttling and server errors are transient and retried once", async () => {
  const { api, calls } = build([
    { status: 429, body: { error: { code: 4, message: "rate limited" } } },
  ]);

  const result = await api.fetchAccount("token");

  assert.ok(!result.ok);
  assert.equal(result.kind, "transient");
  assert.equal(calls.length, 2, "a transient failure is retried exactly once");
});

// Retrying an auth failure would burn quota to learn the same thing.
test("an auth failure is not retried", async () => {
  const { api, calls } = build([
    { status: 400, body: { error: { code: 190, message: "expired" } } },
  ]);

  await api.fetchAccount("token");

  assert.equal(calls.length, 1);
});

test("insights flatten to a name-keyed map with absent metrics left null", async () => {
  const { api } = build([
    {
      body: {
        data: [
          { name: "reach", total_value: { value: 640 } },
          { name: "total_interactions", total_value: { value: 96 } },
        ],
      },
    },
  ]);

  const result = await api.fetchAccountInsights("token", "ig-1");

  assert.ok(result.ok);
  assert.equal(result.value.reach, 640);
  assert.equal(result.value.totalInteractions, 96);
  // Not requested back by Meta, so it stays absent rather than becoming zero.
  assert.equal(result.value.profileLinksTaps, null);
});

test("media insights are fetched in one request, not one per post", async () => {
  const { api, calls } = build([
    {
      body: {
        data: [
          {
            id: "m1",
            media_type: "REELS",
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-08-01T10:00:00+0000",
            like_count: 12,
            comments_count: 3,
            insights: {
              data: [
                { name: "views", values: [{ value: 900 }] },
                { name: "reach", values: [{ value: 700 }] },
              ],
            },
          },
        ],
      },
    },
  ]);

  const result = await api.fetchMediaWithInsights("token");

  assert.ok(result.ok);
  assert.equal(calls.length, 1);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].views, 900);
  assert.equal(result.value[0].likes, 12);
  // Never returned by Meta for this post: null, not zero.
  assert.equal(result.value[0].saved, null);
});

test("a post's image is a video's cover frame, else the media itself", async () => {
  const { api, calls } = build([
    {
      body: {
        data: [
          { id: "img", media_type: "IMAGE", media_url: "https://cdn/img.jpg", caption: "Hi" },
          {
            id: "reel",
            media_type: "VIDEO",
            media_url: "https://cdn/reel.mp4",
            thumbnail_url: "https://cdn/reel.jpg",
          },
          { id: "bare-video", media_type: "VIDEO", media_url: "https://cdn/v.mp4" },
          { id: "unsafe", media_type: "IMAGE", media_url: "javascript:alert(1)" },
        ],
      },
    },
  ]);

  const result = await api.fetchMediaWithInsights("token");

  assert.ok(result.ok);
  assert.ok(calls[0].url.includes("caption"));
  assert.deepEqual(
    result.value.map((post) => [post.mediaId, post.thumbnailUrl, post.caption]),
    [
      ["img", "https://cdn/img.jpg", "Hi"],
      ["reel", "https://cdn/reel.jpg", null],
      // A video file is never used as an image.
      ["bare-video", null, null],
      // Only https links are kept.
      ["unsafe", null, null],
    ],
  );
});

test("a media entry with no id is dropped rather than stored keyless", async () => {
  const { api } = build([{ body: { data: [{ media_type: "IMAGE" }, { id: "m2" }] } }]);

  const result = await api.fetchMediaWithInsights("token");

  assert.ok(result.ok);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].mediaId, "m2");
});

test("the code exchange posts the secret in a form body, not the url", async () => {
  const { api, calls } = build([
    { body: { access_token: "short-lived", expires_in: 3_600, user_id: 42 } },
  ]);

  const result = await api.exchangeCode("auth-code");

  assert.ok(result.ok);
  assert.equal(result.value.userId, "42");
  assert.ok(!calls[0].url.includes("app-secret"));
  assert.ok(String(calls[0].init.body).includes("client_secret=app-secret"));
  assert.equal(calls[0].init.method, "POST");
});

test("a token response with no token is invalid rather than a silent success", async () => {
  const { api } = build([{ body: { expires_in: 3_600 } }]);

  const result = await api.exchangeCode("auth-code");

  assert.ok(!result.ok);
  assert.equal(result.kind, "invalid");
});

// Meta's grant endpoints ignore a Bearer header and answer "The parameter
// access_token is required"; the token has to be in the query string.
test("the long-lived exchange sends the short-lived token as access_token", async () => {
  const { api, calls } = build([{ body: { access_token: "long", expires_in: 5_184_000 } }]);

  const result = await api.exchangeForLongLived("short-token");

  assert.ok(result.ok);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("grant_type"), "ig_exchange_token");
  assert.equal(url.searchParams.get("access_token"), "short-token");
  assert.ok(url.searchParams.get("client_secret"));
});

test("refresh sends the current token as access_token", async () => {
  const { api, calls } = build([{ body: { access_token: "fresh", expires_in: 5_184_000 } }]);

  await api.refreshToken("old-token");

  assert.equal(new URL(calls[0].url).searchParams.get("access_token"), "old-token");
});

test("refresh asks for ig_refresh_token and yields sixty days", async () => {
  const { api, calls } = build([{ body: { access_token: "fresh", expires_in: 5_184_000 } }]);

  const result = await api.refreshToken("old-token");

  assert.ok(result.ok);
  assert.equal(result.value.expiresInSeconds, 5_184_000);
  assert.ok(calls[0].url.includes("grant_type=ig_refresh_token"));
});

// The error message is the likeliest place for a token to leak: Meta echoes the
// request back in some failures.
test("a failure message is scrubbed before it is returned", async () => {
  const token = "IGQVJleakedtokenvalueinsideerrormessage";
  const { api } = build([
    {
      status: 400,
      body: { error: { code: 100, message: `bad request: access_token=${token}` } },
    },
  ]);

  const result = await api.fetchAccount("token");

  assert.ok(!result.ok);
  assert.ok(!result.error.includes(token));
});

test("a network failure is transient rather than a thrown error", async () => {
  const fetchImpl = (async () => {
    throw new Error("ECONNRESET");
  }) as unknown as FetchLike;

  const api = new GraphInstagramApi(
    { get: (path: string) => settings[path] } as unknown as ConfigService,
    fetchImpl,
  );

  const result = await api.fetchAccount("token");

  assert.ok(!result.ok);
  assert.equal(result.kind, "transient");
});

// Meta rejects the whole inline-insights request when any one post predates
// the account's switch to professional. One old post must not cost every post.
test("a post Meta won't report on falls back to per-post insights, not a failed pull", async () => {
  const { api, calls } = build([
    {
      status: 400,
      body: {
        error: {
          code: 100,
          error_subcode: 2108006,
          message:
            "The media was posted before the most recent time that the user's account was converted to a business account from a personal account.",
        },
      },
    },
    {
      body: {
        data: [
          { id: "new-post", media_type: "IMAGE", like_count: 5, comments_count: 1 },
          { id: "old-post", media_type: "IMAGE", like_count: 2, comments_count: 0 },
        ],
      },
    },
    { body: { data: [{ name: "views", values: [{ value: 40 }] }, { name: "reach", values: [{ value: 30 }] }] } },
    { status: 400, body: { error: { code: 10, message: "posted before conversion" } } },
  ]);

  const result = await api.fetchMediaWithInsights("token");

  assert.ok(result.ok);
  const [fresh, old] = result.value;
  assert.deepEqual([fresh?.mediaId, fresh?.views, fresh?.reach, fresh?.likes], ["new-post", 40, 30, 5]);
  // Insights refused: null, never zero; likes and comments still come through.
  assert.deepEqual([old?.mediaId, old?.views, old?.reach, old?.likes], ["old-post", null, null, 2]);
  assert.ok(!new URL(calls[1].url).searchParams.get("fields")?.includes("insights"));
  assert.ok(calls[2].url.includes("/new-post/insights"));
});

test("a transient media failure is still a failure, not a fallback", async () => {
  const { api, calls } = build([{ status: 500, body: { error: { code: 1, message: "boom" } } }]);

  const result = await api.fetchMediaWithInsights("token");

  assert.ok(!result.ok);
  // Transient failures are retried once by the http helper, never re-planned.
  assert.ok(calls.every((call) => call.url.includes("insights.metric")));
});

test("an insights range is sent as since/until in Unix seconds", async () => {
  const { api, calls } = build([{ body: { data: [] } }]);

  await api.fetchAccountInsights("token", "ig-1", {
    since: new Date("2026-10-12T23:00:00.000Z"),
    until: new Date("2026-10-13T23:00:00.000Z"),
  });

  const url = new URL(calls[0]?.url ?? "");

  assert.equal(url.searchParams.get("since"), "1791846000");
  assert.equal(url.searchParams.get("until"), "1791932400");
  assert.equal(url.searchParams.get("period"), "day");
});

test("without a range no window is sent", async () => {
  const { api, calls } = build([{ body: { data: [] } }]);

  await api.fetchAccountInsights("token", "ig-1");

  const url = new URL(calls[0]?.url ?? "");

  assert.equal(url.searchParams.has("since"), false);
  assert.equal(url.searchParams.has("until"), false);
});
