import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  eligibleProgrammeSchema,
  type EligibleProgramme,
} from "@/schemas/eligible-programme.schema";

/**
 * The eligible set for the signed-in user.
 *
 * Throws rather than returning an empty list on failure: an empty list is a
 * meaningful answer here ("nothing is eligible"), so swallowing an outage
 * would render that as fact. The page's RetryBoundary turns the throw into
 * the inline error-and-retry the list is meant to show.
 */
export async function getEligibleProgrammesServer(): Promise<
  EligibleProgramme[]
> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${serverApiBaseUrl}/programmes/eligible`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `Eligible programmes failed with status ${response.status}`,
    );
  }

  const payload: unknown = await response.json();
  const parsed = eligibleProgrammeSchema.array().safeParse(payload);

  if (!parsed.success) {
    throw new Error("Eligible programmes returned an unreadable result");
  }

  return parsed.data;
}
