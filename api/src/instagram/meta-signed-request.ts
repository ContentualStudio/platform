import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `signed_request`.
 *
 * The format is `<base64url signature>.<base64url payload>`, where the
 * signature is HMAC-SHA256 of the *encoded* payload string — not of the decoded
 * JSON. Signing the decoded form is the classic way to get this wrong and end
 * up with a verifier that rejects every real request.
 *
 * Verification happens before the payload is trusted for anything, because this
 * endpoint deletes data on the say-so of whoever calls it. An unverified
 * request is not a request.
 */
export interface SignedRequestPayload {
  readonly user_id?: string;
  readonly algorithm?: string;
  readonly issued_at?: number;
}

export type SignedRequestResult =
  | { readonly ok: true; readonly payload: SignedRequestPayload }
  | { readonly ok: false; readonly reason: string };

// A signature that arrived hours late is either a replay or a badly broken
// clock. Meta issues these immediately.
const maxAgeSeconds = 24 * 60 * 60;

export function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
  now: Date = new Date(),
): SignedRequestResult {
  const [encodedSignature, encodedPayload] = signedRequest.split(".");

  if (!encodedSignature || !encodedPayload) {
    return { ok: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();
  const provided = Buffer.from(encodedSignature, "base64url");

  // Length is checked first because timingSafeEqual throws on a mismatch; the
  // comparison itself stays constant-time so the signature cannot be probed a
  // byte at a time.
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: SignedRequestPayload;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SignedRequestPayload;
  } catch {
    return { ok: false, reason: "unparseable_payload" };
  }

  // Pinned explicitly: accepting whatever algorithm the payload names would let
  // a caller downgrade to one we do not actually verify.
  if (payload.algorithm?.toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, reason: "unexpected_algorithm" };
  }

  if (
    typeof payload.issued_at === "number" &&
    now.getTime() / 1000 - payload.issued_at > maxAgeSeconds
  ) {
    return { ok: false, reason: "stale" };
  }

  if (!payload.user_id) {
    return { ok: false, reason: "no_subject" };
  }

  return { ok: true, payload };
}

/** Builds a signed request. Used by tests, and by nothing else. */
export function signRequestForTest(
  payload: SignedRequestPayload,
  appSecret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest("base64url");

  return `${signature}.${encodedPayload}`;
}
