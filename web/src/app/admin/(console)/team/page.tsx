import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTeamMembers, AdminTeamSkeleton } from "@/components/admin/team/admin-team";
import { RetryBoundary } from "@/components/error/retry-boundary";

export const metadata: Metadata = { title: "Team" };

export default function AdminTeamPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <AdminPageHeader
        description="People who can sign in to the admin. Admins can see every creator's data."
        eyebrow="Settings"
        title="Team"
      />

      <RetryBoundary description="We couldn't load the team." title="Team unavailable">
        <Suspense fallback={<AdminTeamSkeleton />}>
          <AdminTeamMembers />
        </Suspense>
      </RetryBoundary>
    </div>
  );
}
