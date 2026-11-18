import { Suspense } from "react";
import { ProfileHeader } from "@/components/dashboard/profile-header";
import { ProtectedShell } from "@/components/dashboard/protected-shell";
import { HeaderSkeleton } from "@/components/dashboard/shell-skeletons";
import { HeaderRetryBoundary } from "@/components/error/header-retry-boundary";

// Routes with the persistent header (home, programs, analytics, planning,
// studio). The frame prerenders; only the header streams at request time.
export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedShell
      header={
        <HeaderRetryBoundary>
          <Suspense fallback={<HeaderSkeleton />}>
            <ProfileHeader />
          </Suspense>
        </HeaderRetryBoundary>
      }
    >
      {children}
    </ProtectedShell>
  );
}
