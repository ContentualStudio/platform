import { NextResponse } from "next/server";
import { serverApiBaseUrl } from "@/lib/api-client";
import { clientIpFromHeaders } from "@/lib/rate-limit/identifier";
import { ActionFailure } from "@/lib/server/result";

/**
 * Same header the browser sets in `auth.service.ts`. Duplicated here rather
 * than imported from the client telemetry module, which pulls `posthog-js`.
 */
const POSTHOG_DISTINCT_ID_HEADER = "x-posthog-distinct-id";

/**
 * Forwards a JSON POST to the api and copies Set-Cookie onto the response.
 *
 * Auth verify-code writes the session cookie on the api response. A wrapper
 * that only returned parsed JSON would drop it, and the browser would send the
 * next navigation with no session. The rest of the body is passed through as
 * JSON so the existing client parser keeps working.
 */
export async function proxyJsonToApi(
  request: Request,
  apiPath: string,
  body: unknown,
  fallbackMessage: string,
): Promise<NextResponse> {
  const distinctId = request.headers.get(POSTHOG_DISTINCT_ID_HEADER);
  const cookie = request.headers.get("cookie");
  // The api sees this server as the caller; pass the client's address on so
  // anything the api meters per client is metered per client, not globally.
  // Same reading as this app's own limiter, so both bucket a client alike.
  const ip = clientIpFromHeaders(request.headers);

  const upstream = await fetch(`${serverApiBaseUrl}${apiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(ip !== "unknown" ? { "x-forwarded-for": ip } : {}),
      ...(distinctId ? { [POSTHOG_DISTINCT_ID_HEADER]: distinctId } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload: { code?: unknown; message?: unknown } = await upstream
    .json()
    .catch(() => ({}));

  if (!upstream.ok) {
    throw new ActionFailure(
      typeof payload.code === "string" ? payload.code : "AUTH_REQUEST_FAILED",
      typeof payload.message === "string" ? payload.message : fallbackMessage,
    );
  }

  const response = NextResponse.json(payload, { status: upstream.status });
  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];

  for (const setCookie of setCookies) {
    response.headers.append("Set-Cookie", setCookie);
  }

  return response;
}
