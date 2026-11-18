import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminUserSearch,
  AdminUserSearchSkeleton,
} from "@/components/admin/users/admin-user-search";
import {
  AdminUsersResults,
  AdminUsersTableSkeleton,
} from "@/components/admin/users/admin-users-table";
import { RetryBoundary } from "@/components/error/retry-boundary";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <AdminPageHeader
        description="Find any creator and see their tier, programme and streak at a glance."
        eyebrow="Operations"
        title="Users"
      />

      {/* One panel: search in the toolbar, results and paging below it. */}
      <section
        aria-label="Users"
        className="overflow-hidden rounded-lg border border-border bg-background"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {/* useSearchParams always suspends during prerender. */}
          <Suspense fallback={<AdminUserSearchSkeleton />}>
            <AdminUserSearch />
          </Suspense>
        </div>

        {/* Retry re-runs the same URL, so the search term is kept. */}
        <RetryBoundary description="We couldn't load users. Please try again." title="Users unavailable">
          <Suspense fallback={<AdminUsersTableSkeleton />}>
            <AdminUsersResults searchParams={searchParams} />
          </Suspense>
        </RetryBoundary>
      </section>
    </>
  );
}
