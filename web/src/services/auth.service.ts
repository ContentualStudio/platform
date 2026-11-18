import { apiFetch, apiBaseUrl } from "@/lib/api-client";
import {
  POSTHOG_DISTINCT_ID_HEADER,
  telemetryDistinctId,
} from "@/lib/telemetry/client";
import {
  type AuthIntent,
  authErrorResponseSchema,
  authResponseSchema,
  sendCodeRequestSchema,
  type SendCodeRequest,
  verifyCodeRequestSchema,
  type VerifyCodeRequest,
} from "@/schemas/auth.schema";

export const authApiUrl = apiBaseUrl;

export class AuthServiceError extends Error {
  constructor(
    message: string,
    readonly code = "AUTH_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

async function postAuth(path: string, body: Record<string, unknown>) {
  const distinctId = telemetryDistinctId();

  const { response, rawPayload } = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      // Lets the api attribute the pre-auth moments — a code requested, an
      // account created — to this browser, so `posthog.identify()` after
      // sign-in can join that history onto the real user. Sent only from the
      // auth calls that happen before there is a session to attribute to.
      ...(distinctId ? { [POSTHOG_DISTINCT_ID_HEADER]: distinctId } : {}),
    },
  });

  if (!response.ok) {
    const payload = authErrorResponseSchema.parse(rawPayload);
    throw new AuthServiceError(
      payload.message ?? payload.code ?? "Auth request failed.",
      payload.code ?? "AUTH_REQUEST_FAILED",
    );
  }

  return authResponseSchema.parse(rawPayload);
}

async function postWebAuth(path: string, body: Record<string, unknown>) {
  const distinctId = telemetryDistinctId();

  // Same-origin Route Handlers, not the api origin: that is how the named
  // auth limiter actually sees these calls. A rewrite to the api would skip
  // the wrappers, and locally NEXT_PUBLIC_API_URL points at the api directly.
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(distinctId ? { [POSTHOG_DISTINCT_ID_HEADER]: distinctId } : {}),
    },
    body: JSON.stringify(body),
  });

  const rawPayload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const payload = authErrorResponseSchema.parse(rawPayload);
    throw new AuthServiceError(
      payload.message ?? payload.code ?? "Auth request failed.",
      payload.code ?? "AUTH_REQUEST_FAILED",
    );
  }

  return authResponseSchema.parse(rawPayload);
}

export async function sendEmailCode(input: SendCodeRequest) {
  const payload = sendCodeRequestSchema.parse(input);
  return postWebAuth("/api/auth/email/send-code", payload);
}

export async function verifyEmailCode(input: VerifyCodeRequest) {
  const payload = verifyCodeRequestSchema.parse(input);
  return postWebAuth("/api/auth/email/verify-code", payload);
}

export async function signOut() {
  return postAuth("/auth/sign-out", {});
}

export function getGoogleAuthUrl(intent: AuthIntent) {
  return `${authApiUrl}/auth/google?intent=${intent}`;
}
