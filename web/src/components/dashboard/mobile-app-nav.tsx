"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnalyticsNavIcon,
  HomeNavIcon,
  PlanningNavIcon,
  ProgramsNavIcon,
  StudioNavIcon,
} from "@/components/dashboard/nav-icons";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: HomeNavIcon, label: "Home" },
  { href: "/programs", icon: ProgramsNavIcon, label: "Programs" },
  { href: "/analytics", icon: AnalyticsNavIcon, label: "Analytics" },
  { href: "/planning", icon: PlanningNavIcon, label: "Planning" },
  { href: "/studio", icon: StudioNavIcon, label: "Studio" },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileAppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile app navigation"
      className={cn(
        "fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-50 grid grid-cols-5 gap-0 rounded-[22px] p-1.75",
        "bg-surface/94 shadow-menu backdrop-blur-lg",
        "max-[920px]:grid min-[921px]:hidden",
      )}
    >
      {navItems.map((item) => {
        const active = isActiveRoute(pathname, item.href);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[15px] px-0.75 py-2",
              "text-2xs font-bold leading-none transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "bg-accent/10 text-accent dark:bg-[#4a2114]"
                : "text-muted hover:text-foreground",
            )}
            href={item.href}
            key={item.label}
          >
            <item.icon active={active} className="size-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
