import { scrubText } from "../observability/scrub-secrets";
import {
  apiFailure,
  apiSuccess,
  type InstagramResult,
} from "./instagram-api.port";

/**
 * The outbound HTTP helper for Meta's Graph API.
 *
 * There is no shared fetch wrapper in this api — the only other outbound call,
 * `email.service.ts`, uses bare `fetch` — so this establishes the conventions
 * for one caller rather than pretending to be a general client:
 *
 *   - A timeout, because a hung Meta request would otherwise hold a daily-pull
 *     worker slot until the process restarted.
 *   - One retry on transient failures only. A daily job's real retry is
 *     tomorrow's run; retrying an auth failure would just burn quota.
 *   - The token travels in the Authorization header, never in the query string,
 *     so it cannot land in an upstream access log we do not control. The only
 *     exceptions are the long-lived exchange and refresh grants, which Meta
 *     reads from the query string alone (see GraphInstagramApi.tokenGrant).
 *   - Every error string is scrubbed before it is returned, because the request
 *     url is the most likely place for a token to leak into a message.
 */
export interface InstagramRequest {
  readonly url: string;
  readonly method?: "GET" | "POST" | "DELETE";
  readonly accessToken?: string;
  readonly form?: Record<string, string>;
  readonly timeoutMs: number;
}

export type FetchLike = typeof globalThis.fetch;

// Meta's own error envelope. `code` is the field that distinguishes "this token
// is dead" from "this account cannot serve this metric", which is the whole
// reason failures are classified rather than lumped together.
interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

// 190 is the token family: expired, revoked, changed password, logged out.
// 102 is a dead session. 10 and the 200-block are permission refusals — the
// account cannot serve this, which is a state to degrade around, not an error.
const authErrorCodes = new Set([102, 190, 458, 459, 460, 463, 467]);
const permissionErrorCodes = new Set([10, 200, 803]);

export async function instagramRequest<T>(
  request: InstagramRequest,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<InstagramResult<T>> {
  const first = await attempt<T>(request, fetchImpl);

  if (first.ok || first.kind !== "transient") {
    return first;
  }

  // One retry, and only for transient failures. Jitter so a fleet of workers
  // waking on the same tick does not resend in lockstep.
  await delay(250 + Math.floor(Math.random() * 250));

  return attempt<T>(request, fetchImpl);
}

async function attempt<T>(
  request: InstagramRequest,
  fetchImpl: FetchLike,
): Promise<InstagramResult<T>> {
  let response: Response;

  try {
    response = await fetchImpl(request.url, {
      method: request.method ?? "GET",
      headers: {
        ...(request.accessToken
          ? { Authorization: `Bearer ${request.accessToken}` }
          : {}),
        ...(request.form
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: request.form ? new URLSearchParams(request.form).toString() : undefined,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    // A timeout, a DNS failure or a dropped connection. All the same shape of
    // problem: nothing was learned, try again later.
    return apiFailure("transient", scrubText(describe(error)));
  }

  const body = (await response.json().catch(() => ({}))) as GraphErrorBody & T;

  if (response.ok && !body.error) {
    return apiSuccess(body as T);
  }

  return apiFailure(
    classify(response.status, body.error?.code),
    scrubText(body.error?.message ?? `Instagram request failed (${response.status}).`),
    response.status,
  );
}

function classify(
  status: number,
  graphCode?: number,
): "auth" | "permission" | "transient" | "invalid" {
  // Meta's own code is more precise than the HTTP status, which is 400 for
  // almost everything, so it wins where present.
  if (graphCode !== undefined) {
    if (authErrorCodes.has(graphCode)) {
      return "auth";
    }

    if (permissionErrorCodes.has(graphCode)) {
      return "permission";
    }

    // 4 and 17 are throttling; 1 and 2 are Meta's own transient failures.
    if ([1, 2, 4, 17, 32, 613].includes(graphCode)) {
      return "transient";
    }
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 429 || status >= 500) {
    return "transient";
  }

  return "invalid";
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError"
      ? "Instagram request timed out."
      : error.message;
  }

  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
