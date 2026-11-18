"use server";

import { adminServerSend } from "@/lib/admin/admin-api-write";
import { defineServerAction } from "@/lib/server/action";
import {
  inviteAdminInputSchema,
  inviteAdminResultSchema,
  removeAdminInputSchema,
  removeAdminResultSchema,
  type InviteAdminInput,
  type InviteAdminResult,
  type RemoveAdminInput,
  type RemoveAdminResult,
} from "@/schemas/admin-team.schema";

const inviteFailure = "We couldn't add that admin. Try again.";
const removeFailure = "We couldn't remove that admin. Try again.";

export const inviteAdminAction = defineServerAction<InviteAdminResult, InviteAdminInput>({
  name: "inviteAdmin",
  // Each invite sends an email.
  rateLimit: "mutation",
  input: inviteAdminInputSchema,
  failureMessage: inviteFailure,
  handler: (input) =>
    adminServerSend("POST", "/admin/team/invite", input, inviteAdminResultSchema, inviteFailure),
});

export const removeAdminAction = defineServerAction<RemoveAdminResult, RemoveAdminInput>({
  name: "removeAdmin",
  rateLimit: "mutation",
  input: removeAdminInputSchema,
  failureMessage: removeFailure,
  handler: ({ id }) =>
    adminServerSend(
      "DELETE",
      `/admin/team/${encodeURIComponent(id)}`,
      undefined,
      removeAdminResultSchema,
      removeFailure,
    ),
});
