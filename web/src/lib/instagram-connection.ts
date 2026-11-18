import { z } from "zod";

/**
 * The non-secret view of a user's Instagram connection.
 *
 * Mirrors `GET /instagram/connection`. There is deliberately no token field
 * anywhere in this shape: the api never returns one, and parsing strictly means
 * a future change that started returning one would fail loudly here rather than
 * quietly reaching a browser.
 */
export const instagramConnectionStatusSchema = z.enum([
  "connected",
  "reconnect_required",
  "disconnected",
]);
export const instagramAccountTypeSchema = z.enum(["professional", "personal"]);

export const instagramConnectionResponseSchema = z
  .object({
    connected: z.boolean(),
    // False when no Meta app is configured yet. The connect button is hidden
    // rather than offered and then failing.
    available: z.boolean(),
    connection: z
      .object({
        username: z.string().min(1),
        accountType: instagramAccountTypeSchema.nullable(),
        status: instagramConnectionStatusSchema,
        dataConsent: z.boolean(),
        connectedAt: z.string().min(1),
        scopes: z.array(z.string()),
      })
      .nullable(),
  })
  .strict();

export type InstagramConnectionResponse = z.infer<
  typeof instagramConnectionResponseSchema
>;

export type InstagramConnection = NonNullable<
  InstagramConnectionResponse["connection"]
>;

/**
 * What the platforms screen should show.
 *
 * Derived in one place so the screen never has to reason about the combination
 * of `connected`, `status` and `accountType` inline — the three of them make
 * five states, and getting the precedence wrong is how a user ends up being
 * asked to convert an account they already converted.
 */
export type InstagramConnectionState =
  | { kind: "unavailable" }
  | { kind: "disconnected" }
  | { kind: "needs-professional"; connection: InstagramConnection }
  | { kind: "needs-reconnect"; connection: InstagramConnection }
  | { kind: "connected"; connection: InstagramConnection };

export function toInstagramConnectionState(
  response: InstagramConnectionResponse,
): InstagramConnectionState {
  if (!response.connected || !response.connection) {
    return response.available ? { kind: "disconnected" } : { kind: "unavailable" };
  }

  const connection = response.connection;

  // Account type first: a personal account is the more actionable of the two
  // problems, and it is also the cause of the reconnect flag when both are set.
  if (connection.accountType === "personal") {
    return { kind: "needs-professional", connection };
  }

  if (connection.status === "reconnect_required") {
    return { kind: "needs-reconnect", connection };
  }

  return { kind: "connected", connection };
}

/**
 * The result Instagram redirected back with, read from the query string.
 *
 * Every failure is recoverable and none of them block onboarding, so this is a
 * banner's worth of information rather than a state the app gets stuck in.
 */
export type InstagramCallbackResult =
  | { kind: "none" }
  | { kind: "connected"; username: string | null; limitedFollowers: boolean }
  | { kind: "personal"; username: string | null }
  | { kind: "error"; reason: string };

export function readCallbackResult(
  params: URLSearchParams | Record<string, string | undefined>,
): InstagramCallbackResult {
  const get = (name: string) =>
    params instanceof URLSearchParams ? params.get(name) : (params[name] ?? null);

  const outcome = get("instagram");

  if (outcome === "error") {
    return { kind: "error", reason: get("reason") ?? "unknown" };
  }

  if (outcome !== "connected") {
    return { kind: "none" };
  }

  const username = get("username");

  if (get("accountType") === "personal") {
    return { kind: "personal", username };
  }

  return {
    kind: "connected",
    username,
    limitedFollowers: get("limited") === "followers",
  };
}

/** The message shown for a failed authorization. */
export function describeCallbackError(reason: string): string {
  switch (reason) {
    case "cancelled":
      return "Instagram connection was cancelled. You can try again whenever you like.";
    case "invalid_state":
      return "That connection link expired. Start again to connect Instagram.";
    case "exchange_failed":
    case "account_unreadable":
      return "We couldn't finish connecting Instagram. Please try again.";
    default:
      return "We couldn't connect Instagram. Please try again.";
  }
}
