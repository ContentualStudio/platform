import { notFound, redirect } from "next/navigation";
import { serverApiBaseUrl } from "@/lib/api-client";

/**
 * A server-side read of an admin endpoint as the signed-in team member.
 *
 * A 401 means the admin session is gone, so it redirects to sign-in — the
 * RetryBoundary around every admin section lets `redirect()` through. Any
 * other failure throws, which that boundary turns into an inline error with
 * retry, so an api hiccup never reads as "no data".
 */
export async function adminServerGet<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const { cookies } = await import("next/headers");
  const cookieHeader = (await cookies()).toString();

  const response = await fetch(`${serverApiBaseUrl}${path}`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/admin/sign-in");
  }

  // A missing record is a page that does not exist, not a failure to retry.
  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error("We couldn't load this from the admin service. Please try again.");
  }

  return schema.parse(await response.json());
}
