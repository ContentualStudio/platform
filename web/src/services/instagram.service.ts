import { apiFetch } from "@/lib/api-client";
export class InstagramServiceError extends Error {
  constructor(
    message: string,
    readonly code = "INSTAGRAM_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "InstagramServiceError";
  }
}

async function request(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<unknown> {
  const result = await apiFetch(path, init);

  if (!result.response.ok) {
    const payload = result.rawPayload as { code?: string; message?: string };

    throw new InstagramServiceError(
      payload.message ?? fallbackMessage,
      payload.code,
    );
  }

  return result.rawPayload;
}

/**
 * Records data consent.
 *
 * Withdrawing it does not disconnect. The daily pull stops and the stored data
 * stays, which is the difference between this and the disconnect button — one
 * pauses, the other deletes.
 */
export async function setInstagramConsent(granted: boolean): Promise<void> {
  await request(
    "/instagram/consent",
    { method: "POST", body: JSON.stringify({ granted }) },
    "We couldn't update your data consent. Try again.",
  );
}

/**
 * Starts authorization and hands back the url to send the user to.
 *
 * Consent is a precondition rather than a parallel step: authorizing is itself
 * the first act of reading their data, so it cannot come first. It is passed
 * rather than assumed — the api rejects anything but an explicit grant, and a
 * hardcoded `true` here would make that check validate a constant.
 */
export async function startInstagramConnect(options: {
  consent: boolean;
  returnPath?: string;
}): Promise<string> {
  const payload = (await request(
    "/instagram/oauth/start",
    {
      method: "POST",
      body: JSON.stringify({
        consent: options.consent,
        returnPath: options.returnPath,
      }),
    },
    "We couldn't start the Instagram connection. Try again.",
  )) as { authorizeUrl?: string };

  if (!payload.authorizeUrl) {
    throw new InstagramServiceError(
      "We couldn't start the Instagram connection. Try again.",
    );
  }

  return payload.authorizeUrl;
}

/** Re-reads the account type after the user converts to a professional one. */
export async function recheckInstagramAccount(): Promise<{
  accountType: "professional" | "personal";
  followerCount: number;
}> {
  return (await request(
    "/instagram/recheck",
    { method: "POST" },
    "We couldn't re-check your Instagram account. Try again.",
  )) as { accountType: "professional" | "personal"; followerCount: number };
}

/**
 * Disconnects and erases.
 *
 * Named for what it does rather than for the button that calls it: this removes
 * the growth history, the post metrics and every follower-based badge, and the
 * confirmation dialog has to say so before it runs.
 */
export async function disconnectInstagram(): Promise<void> {
  await request(
    "/instagram/disconnect",
    { method: "POST" },
    "We couldn't disconnect Instagram. Try again.",
  );
}
