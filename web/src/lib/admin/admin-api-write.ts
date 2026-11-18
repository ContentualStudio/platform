import { cookies } from "next/headers";
import type { ZodType } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";
import { ActionFailure } from "@/lib/server/result";

/**
 * A write to the admin api as the signed-in team member, for server actions.
 * The api's own refusals (an expired session, a rule the write breaks) come
 * back as named failures the form shows as they are.
 */
export async function adminServerSend<T>(
  method: "POST" | "DELETE",
  path: string,
  body: unknown,
  schema: ZodType<T>,
  fallbackMessage: string,
): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${serverApiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const payload: { code?: unknown; message?: unknown } = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ActionFailure(
      typeof payload.code === "string" ? payload.code : "ADMIN_WRITE_FAILED",
      typeof payload.message === "string" ? payload.message : fallbackMessage,
    );
  }

  return schema.parse(payload);
}
