import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  ListSkeleton,
  OverviewSkeleton,
  ProgrammeCompletionList,
  ProgrammeCompletionOverview,
} from "@/components/admin/analytics/programme-completion-report";
import { RetryBoundary } from "@/components/error/retry-boundary";

export const metadata: Metadata = { title: "Programme completion" };

// The overview and the per-programme list each have their own skeleton and
// retry boundary: a slow or failing aggregation never blocks the admin, and a
// section that fails on retry leaves the other's figures up. They share one
// cached request, so this is still one api call per load.
export default function ProgrammeCompletionPage() {
  return (
    <>
      <AdminPageHeader
        description="How creators move through each programme — who is on it, who finished, and who dropped off."
        eyebrow="Operations"
        title="Programme completion"
      />

      <div className="flex flex-col gap-10">
        <RetryBoundary description="We couldn't load the overview." title="Overview unavailable">
          <Suspense fallback={<OverviewSkeleton />}>
            <ProgrammeCompletionOverview />
          </Suspense>
        </RetryBoundary>

        <RetryBoundary description="We couldn't load the programmes." title="Programmes unavailable">
          <Suspense fallback={<ListSkeleton />}>
            <ProgrammeCompletionList />
          </Suspense>
        </RetryBoundary>
      </div>
    </>
  );
}
