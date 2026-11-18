import {
  Activity,
  ChartNoAxesColumn,
  Layers,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** False until the section's ticket lands: shown, but not navigable. */
  available: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * The one list of admin sections. The sidebar, its skeleton and anything that
 * needs a section's label read from here, so enabling a section is flipping
 * its `available` flag once its page exists.
 */
export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin/users", label: "Users", icon: UsersRound, available: true },
      {
        href: "/admin/programme-completion",
        label: "Programme completion",
        icon: ChartNoAxesColumn,
        available: true,
      },
      {
        href: "/admin/engine-activity",
        label: "Engine activity",
        icon: Activity,
        available: true,
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/manage-content",
        label: "Manage content",
        icon: Layers,
        available: false,
      },
    ],
  },
  {
    label: "Settings",
    items: [{ href: "/admin/team", label: "Team", icon: UserCog, available: true }],
  },
];

export function isActiveAdminRoute(pathname: string | null, href: string) {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
