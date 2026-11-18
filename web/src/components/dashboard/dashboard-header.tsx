"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { UserMenu } from "@/components/dashboard/user-menu";
import { InstagramIcon } from "@/components/settings/platform-icons";
import { greetingFirstName, displayNameFromProfile } from "@/lib/display-name";
import type { ProfileResponse } from "@/schemas/onboarding.schema";

interface DashboardHeaderProps {
  profile: ProfileResponse;
}

// Explicit titles for routes whose pretty name differs from the slug.
const TITLE_OVERRIDES: Record<string, string> = {
  "cee-ai": "Cee",
  "challenge-setup": "Challenge Setup",
  browse: "Browse Lessons",
  programs: "Active Program",
};

function firstNameFromProfile(profile: ProfileResponse) {
  return greetingFirstName({
    email: profile.user.email,
    name: profile.stage1.name || profile.user.name,
  });
}

function timeGreeting(now: Date) {
  const hour = now.getHours();

  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 18) {
    return "Good Afternoon";
  }

  return "Good Evening";
}

/**
 * The current time, but only once the browser is rendering it.
 *
 * The clock is client state: the server's instant and time zone are not the
 * user's, and with cached rendering the HTML a visitor receives can be hours
 * or days old — a stale date baked into the markup is what produced the
 * "server rendered 26 August, client rendered 28 August" hydration failure.
 * Returning `null` for the first render keeps server and client output
 * identical, which is the only thing hydration requires; the real value
 * arrives immediately afterwards.
 */
function useClientNow(): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
  }, []);

  return now;
}

function prettifySegment(segment: string) {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Derive the page title from the last route segment, greeting on home. */
function pageTitleFromPath(pathname: string): string | null {
  if (pathname === "/dashboard") {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  if (!last) {
    return null;
  }

  return TITLE_OVERRIDES[last] ?? prettifySegment(last);
}

export function DashboardHeader({ profile }: DashboardHeaderProps) {
  const pathname = usePathname();
  const displayName =
    displayNameFromProfile({
      email: profile.user.email,
      name: profile.stage1.name || profile.user.name,
    }) ?? profile.user.email;
  const pageTitle = pageTitleFromPath(pathname);
  const now = useClientNow();
  const firstName = firstNameFromProfile(profile);

  const formattedDate = now
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(now)
    : null;

  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="mb-2 text-[15px] font-semibold text-muted">
          <span className="text-foreground">Today</span>
          {formattedDate ? ` - ${formattedDate}` : null}
        </p>
        {pageTitle ? (
          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground">
            {pageTitle}
          </h1>
        ) : (
          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground">
            {now ? timeGreeting(now) : "Hello"}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        )}
        {pathname === "/analytics" ? (
          <p className="mt-2 flex items-center gap-1.5 text-base text-muted">
            <InstagramIcon className="size-4" />
            Instagram Channel Performance
          </p>
        ) : null}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <NotificationBell />
        <UserMenu image={profile.user.image} name={displayName} />
      </div>
    </header>
  );
}
