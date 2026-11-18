import { z } from "zod";
import { adminServerGet } from "@/lib/admin/admin-api";
import { apiBaseUrl } from "@/lib/api-client";
import type { AdminUsersSearch } from "@/lib/admin/admin-users-search";

export const ADMIN_USERS_PAGE_SIZE = 25;

export const adminUserTierSchema = z.enum(["free", "creator", "pro"]);
export type AdminUserTier = z.infer<typeof adminUserTierSchema>;

export const adminUserListRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  signedUpAt: z.string(),
  avatarVersion: z.string().nullable(),
  isFoundingCreator: z.boolean(),
  tier: adminUserTierSchema,
  currentProgramme: z
    .object({ slug: z.string(), title: z.string().nullable() })
    .nullable(),
  currentStreak: z.number().int().nonnegative(),
  lastActive: z
    .object({ at: z.string(), precision: z.enum(["time", "day"]) })
    .nullable(),
});

export type AdminUserListRow = z.infer<typeof adminUserListRowSchema>;

export const adminUserListPageSchema = z.object({
  users: z.array(adminUserListRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  query: z.string().nullable(),
});

export type AdminUserListPage = z.infer<typeof adminUserListPageSchema>;

export function getAdminUsers({ q, page }: AdminUsersSearch) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(ADMIN_USERS_PAGE_SIZE),
  });

  if (q) params.set("q", q);

  return adminServerGet(`/admin/users?${params}`, adminUserListPageSchema);
}

/**
 * Browser-facing url of a user's avatar, or null when they have none. Goes
 * through the same api origin as sign-in so the admin session cookie rides
 * along; the version busts the browser cache when the picture changes.
 */
export function adminUserAvatarUrl(user: Pick<AdminUserListRow, "id" | "avatarVersion">) {
  return user.avatarVersion
    ? `${apiBaseUrl}/admin/users/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatarVersion)}`
    : null;
}
