"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { serverApiBaseUrl } from "@/lib/api-client";
import { defineServerAction } from "@/lib/server/action";
import {
  programmeTaskProgressSchema,
  type ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

const taskIdSchema = z.object({
  taskId: z.string().min(1),
});

async function postTaskOutcome(taskId: string, outcome: "complete" | "skip") {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(
    `${serverApiBaseUrl}/programme-tasks/${taskId}/${outcome}`,
    {
      method: "POST",
      cache: "no-store",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    },
  );

  if (!response.ok) {
    throw new Error(`Task ${outcome} failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  const parsed = z
    .object({
      recorded: z.boolean(),
      progress: programmeTaskProgressSchema,
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new Error(`Task ${outcome} returned an unreadable result`);
  }

  // `recorded: false` is the retry path, not a failure — the day was already
  // resolved and the caller gets the event that stands.
  return parsed.data as { recorded: boolean; progress: ProgrammeTaskProgress };
}

export const completeProgrammeTaskAction = defineServerAction({
  name: "completeProgrammeTask",
  input: taskIdSchema,
  rateLimit: "mutation",
  failureMessage:
    "We couldn't save your task completion. Please try again.",
  handler: async ({ taskId }) => postTaskOutcome(taskId, "complete"),
});

export const skipProgrammeTaskAction = defineServerAction({
  name: "skipProgrammeTask",
  input: taskIdSchema,
  rateLimit: "mutation",
  failureMessage: "We couldn't save your task skip. Please try again.",
  handler: async ({ taskId }) => postTaskOutcome(taskId, "skip"),
});
