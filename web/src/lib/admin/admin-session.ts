import { cache } from "react";
import { z } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";

export const adminIdentitySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

export type AdminIdentity = z.infer<typeof adminIdentitySchema>;

export type AdminSession =
  | { status: "signed-in"; admin: AdminIdentity }
  | { status: "signed-out" };

/**
 * The admin console's session read, `cache()`d so the gate and the top bar
 * share one request.
 *
 * Unlike `serverApiGet`, a refusal and an outage are kept apart: only a 401
 * means "go and sign in". Anything else throws, so the RetryBoundary around
 * the caller offers a retry instead of bouncing a signed-in team member to the
 * sign-in screen because the api blinked.
 */
export const getAdminServer = cache(async (): Promise<AdminSession> => {
  const { cookies } = await import("next/headers");
  const cookieHeader = (await cookies()).toString();

  const response = await fetch(`${serverApiBaseUrl}/admin/me`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return { status: "signed-out" };
  }

  if (!response.ok) {
    throw new Error("We couldn't reach the admin service. Please try again.");
  }

  return {
    status: "signed-in",
    admin: adminIdentitySchema.parse(await response.json()),
  };
});
