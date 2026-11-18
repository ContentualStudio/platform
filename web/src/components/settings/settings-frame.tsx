"use client";

import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SettingsTabNav } from "@/components/settings/settings-ui";
import { settingsSectionFromPathname } from "@/lib/settings";
import type { ProfileResponse } from "@/schemas/onboarding.schema";

export function SettingsFrame({ profile }: { profile: ProfileResponse }) {
  const pathname = usePathname();
  const section = settingsSectionFromPathname(pathname);
  const displayName = profile.stage1.name || profile.user.name;
  return (
    <>
      <header className="mb-2 flex items-start justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-muted">Settings</p>
          <h1 className="text-[32px] font-semibold leading-normal tracking-tight text-foreground">
            Profile
          </h1>
        </div>
        <UserMenu image={profile.user.image} name={displayName} />
      </header>

      <SettingsTabNav section={section} />
    </>
  );
}
