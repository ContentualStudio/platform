"use client";

import { Moon, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnalyticsNavIcon,
  HomeNavIcon,
  PlanningNavIcon,
  ProgramsNavIcon,
  StudioNavIcon,
} from "@/components/dashboard/nav-icons";
import { UpgradeNudge } from "@/components/billing/upgrade-nudge";
import { useTheme } from "@/components/theme/theme-provider";
import { BrandLogo } from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: HomeNavIcon, label: "Home" },
  { href: "/programs", icon: ProgramsNavIcon, label: "Programs" },
  { href: "/analytics", icon: AnalyticsNavIcon, label: "Analytics" },
  { href: "/planning", icon: PlanningNavIcon, label: "Planning" },
  { href: "/studio", icon: StudioNavIcon, label: "Studio" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setPreference } = useTheme();
  const isDark = resolvedTheme === "dark";

  function isActiveRoute(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-surface px-6 py-9 min-[921px]:flex">
      <Link
        aria-label="Contentual dashboard"
        className="mb-12 block transition-opacity hover:opacity-90"
        href="/dashboard"
      >
        <BrandLogo />
      </Link>

      <nav className="flex flex-1 flex-col gap-5">
        {navItems.map((item) => {
          const active = isActiveRoute(item.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-base transition-colors",
                active
                  ? "font-extrabold text-foreground"
                  : "font-medium text-muted hover:bg-foreground/5 hover:text-foreground",
              )}
              href={item.href}
              key={item.label}
            >
              <item.icon active={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <UpgradeNudge className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-base font-semibold text-accent transition-colors hover:bg-accent/10" />

      <button
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-base text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        onClick={() => setPreference(isDark ? "light" : "dark")}
        type="button"
      >
        {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        {isDark ? "Light mode" : "Dark mode"}
      </button>

      <Link
        aria-current={isActiveRoute("/dashboard/cee-ai") ? "page" : undefined}
        className={cn(
          "mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-base font-semibold transition-colors",
          isActiveRoute("/dashboard/cee-ai")
            ? "bg-accent/10 text-accent"
            : "text-accent hover:bg-accent/10",
        )}
        href="/dashboard/cee-ai"
      >
        <Image alt="" aria-hidden="true" height={20} src="/brand/onboarding-character.png" width={20} />
        <span className="whitespace-nowrap">Cee AI</span>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded bg-border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
          Coming Soon
        </span>
      </Link>
    </aside>
  );
}
