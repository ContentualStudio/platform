import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SettingsContentSkeleton } from "@/components/settings/settings-content-skeleton";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { SettingsSectionPanel } from "@/components/settings/settings-shell";
import { getAnalyticsSnapshotServer } from "@/lib/server-analytics-snapshot";
import {
  getBillingCatalogueServer,
  getBillingMeServer,
} from "@/lib/server-billing";
import { getChallengeSetupServer } from "@/lib/server-challenge-setup";
import { getNotificationPreferencesServer } from "@/lib/server-notifications";
import { getInstagramConnectionServer } from "@/lib/server-instagram-connection";
import { getProfileServer } from "@/lib/server-profile";
import { parseSettingsSection } from "@/lib/settings";

// `params` is awaited below the boundary, not at the top, so the route still
// prerenders a shell for sections that were never built ahead of time.
export default function SettingsSectionPage({
  params,
  searchParams,
}: PageProps<"/settings/[section]">) {
  return (
    <RetryBoundary description="We couldn't load your settings. Please try again.">
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsSectionContent params={params} searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

// Stripe Checkout and the customer portal return to the Account section with
// a query flag; it is read here, below the boundary, so the shell still
// prerenders.
function checkoutReturnState(
  value: string | string[] | undefined,
): "success" | "cancelled" | null {
  const flag = Array.isArray(value) ? value[0] : value;

  return flag === "success" || flag === "cancelled" ? flag : null;
}

async function SettingsSectionContent({
  params,
  searchParams,
}: Pick<PageProps<"/settings/[section]">, "params" | "searchParams">) {
  const [{ section: rawSection }, query] = await Promise.all([
    params,
    searchParams as Promise<Record<string, string | string[] | undefined>>,
  ]);
  const section = parseSettingsSection(rawSection);

  if (!section) {
    notFound();
  }

  const [profile, setup, notifications, analytics, connection, billing, catalogue] =
    await Promise.all([
      getProfileServer(),
      getChallengeSetupServer(),
      getNotificationPreferencesServer(),
      getAnalyticsSnapshotServer(),
      getInstagramConnectionServer(),
      section === "account" ? getBillingMeServer() : Promise.resolve(null),
      section === "account" ? getBillingCatalogueServer() : Promise.resolve(null),
    ]);

  if (!profile) {
    redirect("/auth/sign");
  }

  return (
    <SettingsSectionPanel
      analytics={analytics}
      billing={billing}
      catalogue={catalogue}
      checkoutState={checkoutReturnState(query.checkout)}
      connection={connection}
      notifications={notifications}
      profile={profile}
      section={section}
      setup={setup}
    />
  );
}
