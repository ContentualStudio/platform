import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  BadgeCooldownLog,
  EngineFiringLog,
  EngineFiringsTrend,
  EngineRuleSummary,
  SectionSkeleton,
} from "@/components/admin/engine-activity/engine-activity";
import { RetryBoundary } from "@/components/error/retry-boundary";

export const metadata: Metadata = { title: "Engine activity" };

// Read-only. Each section has its own skeleton and retry boundary, so a slow
// or failing log never holds up the other. The trend and the rule list share
// one cached request.
export default function EngineActivityPage({ searchParams }: PageProps<"/admin/engine-activity">) {
  return (
    <>
      <AdminPageHeader
        description="Which rules are firing and when, and the badges waiting on the 24-hour cooldown."
        eyebrow="Operations"
        title="Engine activity"
      />

      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <RetryBoundary description="We couldn't load the trend." title="Trend unavailable">
            <Suspense fallback={<SectionSkeleton height="h-44" title="Firings per day" />}>
              <EngineFiringsTrend />
            </Suspense>
          </RetryBoundary>

          <RetryBoundary description="We couldn't load the rules." title="Rules unavailable">
            <Suspense fallback={<SectionSkeleton rows={3} title="Rules" />}>
              <EngineRuleSummary />
            </Suspense>
          </RetryBoundary>
        </div>

        {/* Retry re-runs the same URL, so the filters are kept. */}
        <RetryBoundary description="We couldn't load the firing log." title="Firing log unavailable">
          <Suspense fallback={<SectionSkeleton rows={6} title="Firing log" />}>
            <EngineFiringLog searchParams={searchParams} />
          </Suspense>
        </RetryBoundary>

        <RetryBoundary description="We couldn't load the cooldown queue." title="Cooldown queue unavailable">
          <Suspense fallback={<SectionSkeleton rows={4} title="Badge cooldown queue" />}>
            <BadgeCooldownLog />
          </Suspense>
        </RetryBoundary>
      </div>
    </>
  );
}
