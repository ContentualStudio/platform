import { Suspense } from "react";
import { ReferralCapture } from "@/components/billing/referral-capture";
import { BadgeCelebrationHost } from "@/components/notifications/badge-celebration";
import { InAppNotificationsProvider } from "@/components/notifications/in-app-notifications-provider";
import { ProfileGate } from "@/components/dashboard/profile-gate";

// Under Cache Components this layout must not await anything: what it renders
// synchronously becomes the prerendered shell that every protected route
// prefetches. The session check is request-time work, so it sits in a
// Suspense-wrapped server component that renders no UI of its own — it only
// redirects unauthenticated visitors and syncs the stored theme preference.
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <ProfileGate />
      </Suspense>
      <ReferralCapture />
      <InAppNotificationsProvider>
        {children}
        <BadgeCelebrationHost />
      </InAppNotificationsProvider>
    </>
  );
}
