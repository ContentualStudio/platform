"use client";

import { Moon, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import {
  adminNavGroups,
  isActiveAdminRoute,
} from "@/components/admin/admin-nav-items";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// The orange tick on the left edge is the active marker; the fill alone reads
// too close to hover on the recessed sidebar surface.
const itemClassName =
  "relative h-9 gap-2.5 px-2.5 font-medium text-muted-foreground transition-colors before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent before:opacity-0 before:transition-opacity hover:text-foreground data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:before:opacity-100 data-[active=true]:[&>svg]:text-accent-text group-data-[collapsible=icon]:before:hidden";

export function AdminSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="pt-4 pb-6">
        <Link
          aria-label="Contentual admin home"
          className="flex items-center gap-3 rounded-sm px-2 py-1 transition-opacity hover:opacity-90"
          href="/admin"
        >
          <span className="relative size-8 shrink-0 overflow-hidden rounded-sm">
            <Image alt="" fill sizes="32px" src="/brand/contentual-favicon.png" />
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-base font-bold leading-none tracking-tight text-foreground">
              Contentual
            </span>
            <span className="mt-1 text-2xs font-semibold uppercase tracking-wide text-accent-text">
              Admin console
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* usePathname suspends during prerender, so only the menu waits on it;
            the fallback is the same menu with nothing marked active. */}
        <Suspense fallback={<AdminNavMenu pathname={null} />}>
          <AdminNav />
        </Suspense>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function AdminNav() {
  return <AdminNavMenu pathname={usePathname()} />;
}

function AdminNavMenu({ pathname }: { pathname: string | null }) {
  return adminNavGroups.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel className="px-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {group.label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {group.items.map((item) => {
          const active = isActiveAdminRoute(pathname, item.href);

          return (
            <SidebarMenuItem key={item.href}>
              {item.available ? (
                <SidebarMenuButton
                  asChild
                  className={itemClassName}
                  isActive={active}
                  tooltip={item.label}
                >
                  <Link aria-current={active ? "page" : undefined} href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <>
                  <SidebarMenuButton
                    aria-disabled
                    className={itemClassName}
                    tooltip={`${item.label} · coming soon`}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="rounded-full bg-control px-1.5 text-2xs font-semibold text-muted-foreground">
                    Soon
                  </SidebarMenuBadge>
                </>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  ));
}

function ThemeToggle() {
  const { resolvedTheme, setPreference } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <SidebarMenuButton
      className={itemClassName}
      onClick={() => setPreference(isDark ? "light" : "dark")}
      tooltip={label}
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{label}</span>
    </SidebarMenuButton>
  );
}
