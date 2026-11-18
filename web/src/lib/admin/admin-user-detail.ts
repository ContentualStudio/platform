import { cache } from "react";
import { z } from "zod";
import { adminServerGet } from "@/lib/admin/admin-api";
import { adminUserListRowSchema } from "@/lib/admin/admin-users";
import {
  instagramAccountTypeSchema,
  instagramConnectionStatusSchema,
} from "@/lib/instagram-connection";
import { supportOverviewSchema } from "@/schemas/admin-support.schema";
import { programmeHistorySchema } from "@/schemas/programme-history.schema";

const path = (id: string, panel = "") =>
  `/admin/users/${encodeURIComponent(id)}${panel ? `/${panel}` : ""}`;

// The header is the list row, read for one user.
export const getAdminUser = cache((id: string) =>
  adminServerGet(path(id), adminUserListRowSchema),
);

export function getAdminUserProgrammes(id: string) {
  // The user's own history endpoint and this one return the same shape.
  return adminServerGet(path(id, "programmes"), programmeHistorySchema);
}

export function getAdminUserProgress(id: string) {
  return adminServerGet(
    path(id, "progress"),
    z.object({
      currentStreak: z.number(),
      longestStreak: z.number(),
      level: z.string(),
    }),
  );
}

const badgeSchema = z.object({
  badgeId: z.string(),
  key: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  earnedAt: z.string(),
});

export function getAdminUserBadges(id: string) {
  return adminServerGet(path(id, "badges"), z.object({ badges: z.array(badgeSchema) }));
}

const instagramSchema = z.object({
  status: instagramConnectionStatusSchema,
  username: z.string(),
  accountType: instagramAccountTypeSchema.nullable(),
  connectedAt: z.string(),
  disconnectedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  consent: z.object({ granted: z.boolean(), grantedAt: z.string().nullable() }),
});

export type AdminUserInstagram = z.infer<typeof instagramSchema>;

export function getAdminUserPlatform(id: string) {
  return adminServerGet(
    path(id, "platform"),
    z.object({ instagram: instagramSchema.nullable() }),
  );
}

export function getAdminUserSupport(id: string) {
  return adminServerGet(path(id, "support"), supportOverviewSchema);
}
