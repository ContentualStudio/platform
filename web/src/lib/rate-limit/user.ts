import { getCachedSession } from "../session-cache";

export async function userIdFromHeaders(
  headers: Headers,
): Promise<string | undefined> {
  const session = await getCachedSession(headers).catch(() => null);
  return session?.user.id;
}
