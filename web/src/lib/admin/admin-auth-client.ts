import { z } from "zod";
import { apiBaseUrl } from "@/lib/api-client";

const errorSchema = z
  .object({ code: z.string().optional(), message: z.string().optional() })
  .catch({});

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

/**
 * Sign-in goes through same-origin route handlers (`/api/admin-auth/...`), so
 * the shared per-IP "auth" limiter meters it like product sign-in and the
 * session cookie is set on the web origin. Sign-out needs neither and goes
 * straight to the api.
 */
async function post(url: string, body: Record<string, unknown> = {}) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = errorSchema.parse(await response.json().catch(() => ({})));

    throw new AdminAuthError(
      payload.message ?? "Something went wrong. Please try again.",
      payload.code ?? "ADMIN_AUTH_FAILED",
    );
  }
}

/** Rejects with ADMIN_NOT_FOUND for an email that has no admin account. */
export function sendAdminCode(email: string) {
  return post("/api/admin-auth/send-code", { email });
}

export function verifyAdminCode(email: string, code: string) {
  return post("/api/admin-auth/verify-code", { email, code });
}

export function signOutAdmin() {
  return post(`${apiBaseUrl}/admin-auth/sign-out`);
}
