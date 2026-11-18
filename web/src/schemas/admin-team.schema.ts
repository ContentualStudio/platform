import { z } from "zod";
import { emailSchema } from "@/schemas/auth.schema";

export const inviteAdminInputSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(80).optional(),
});

export type InviteAdminInput = z.infer<typeof inviteAdminInputSchema>;

export const removeAdminInputSchema = z.object({ id: z.string().min(1) });

export type RemoveAdminInput = z.infer<typeof removeAdminInputSchema>;

export const adminTeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  addedAt: z.string(),
  /** The inviting admin's email; null when the account was created by script. */
  addedBy: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
});

export type AdminTeamMember = z.infer<typeof adminTeamMemberSchema>;

export const inviteAdminResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("invited"), email: z.string(), emailSent: z.boolean() }),
  z.object({ status: z.literal("already_admin"), email: z.string() }),
]);

export type InviteAdminResult = z.infer<typeof inviteAdminResultSchema>;

export const removeAdminResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("removed"), email: z.string() }),
  z.object({ status: z.literal("not_found") }),
]);

export type RemoveAdminResult = z.infer<typeof removeAdminResultSchema>;
