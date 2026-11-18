"use server";

import { adminServerSend } from "@/lib/admin/admin-api-write";
import { defineServerAction } from "@/lib/server/action";
import {
  applySupportActionInputSchema,
  applySupportActionResultSchema,
  type ApplySupportActionInput,
  type ApplySupportActionResult,
} from "@/schemas/admin-support.schema";

const failure = "We couldn't apply that support action. Try again.";

/**
 * One manual support action on one user. The api runs it behind the admin
 * session, refuses one whose precondition is unmet, and answers a repeat as
 * `unchanged`, so retrying after an error never applies twice.
 */
export const applySupportAction = defineServerAction<
  ApplySupportActionResult,
  ApplySupportActionInput
>({
  name: "applySupportAction",
  rateLimit: "mutation",
  input: applySupportActionInputSchema,
  failureMessage: failure,
  handler: ({ userId, action, reason }) =>
    adminServerSend(
      "POST",
      `/admin/users/${encodeURIComponent(userId)}/support`,
      { action, reason },
      applySupportActionResultSchema,
      failure,
    ),
});
