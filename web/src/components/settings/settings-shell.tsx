"use client";

import { usePathname } from "next/navigation";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import {
  AccountSettings,
  type CheckoutReturnState,
} from "@/components/settings/account-settings";
import { JourneySettings } from "@/components/settings/journey-settings";
import { LinkedAccountsSettings } from "@/components/settings/linked-accounts-settings";
import type { AnalyticsSnapshotResponse } from "@/lib/analytics-snapshot";
import type { InstagramConnectionResponse } from "@/lib/instagram-connection";
import type { BillingCatalogue, BillingMe } from "@/schemas/billing.schema";
import { settingsSectionFromPathname, type SettingsSection } from "@/lib/settings";
import type { ChallengeSetupStatus } from "@/schemas/challenge-setup.schema";
import type { NotificationPreferencesResponse } from "@/schemas/notifications.schema";
import type { ProfileResponse } from "@/schemas/onboarding.schema";

export function SettingsSectionPanel({
  analytics,
  billing,
  catalogue,
  checkoutState,
  connection,
  notifications,
  profile,
  section: sectionProp,
  setup,
}: {
  analytics: AnalyticsSnapshotResponse | null;
  billing: BillingMe | null;
  catalogue: BillingCatalogue | null;
  checkoutState: CheckoutReturnState;
  connection: InstagramConnectionResponse | null;
  profile: ProfileResponse;
  section: SettingsSection;
  setup: ChallengeSetupStatus | null;
  notifications: NotificationPreferencesResponse | null;
}) {
  const pathname = usePathname();
  const section = settingsSectionFromPathname(pathname) ?? sectionProp;

  return (
    <div className="motion-safe:animate-[auth-fade-slide-in_200ms_ease]">
      {section === "profile" ? <ProfileSettingsForm profile={profile} /> : null}
      {section === "linked" ? (
        <LinkedAccountsSettings
          analytics={analytics}
          connection={connection}
          setup={setup}
        />
      ) : null}
      {section === "journey" ? (
        <JourneySettings
          analytics={analytics}
          profile={profile}
          setup={setup}
        />
      ) : null}
      {section === "notifications" ? (
        <NotificationsSettings preferences={notifications} />
      ) : null}
      {section === "account" ? (
        <AccountSettings
          billing={billing}
          catalogue={catalogue}
          checkoutState={checkoutState}
          savedTheme={profile.preferences.theme}
        />
      ) : null}
    </div>
  );
}
