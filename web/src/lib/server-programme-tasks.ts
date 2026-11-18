import { cookies } from "next/headers";
import { serverApiBaseUrl } from "@/lib/api-client";
import {
  programmeTaskProgressSchema,
  programmeTaskSchema,
  type ProgrammeTask,
  type ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

export async function getProgrammeTasksServer(): Promise<ProgrammeTask[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${serverApiBaseUrl}/programme-tasks`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    return [];
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = programmeTaskSchema.array().safeParse(payload);

  return parsed.success ? parsed.data : [];
}

/**
 * Outcomes already recorded for the active assignment. An empty list is the
 * honest answer for both "nothing resolved yet" and an unreachable API — the
 * card stays interactive and the server still refuses a duplicate write.
 */
export async function getProgrammeTaskProgressServer(): Promise<
  ProgrammeTaskProgress[]
> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${serverApiBaseUrl}/programme-tasks/progress`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    return [];
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = programmeTaskProgressSchema.array().safeParse(payload);

  return parsed.success ? parsed.data : [];
}
