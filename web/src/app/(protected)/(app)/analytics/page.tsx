import { Suspense } from "react";
import { GrowthSection } from "@/components/analytics/growth-section";
import { PostsSection } from "@/components/analytics/posts-section";
import {
  SnapshotSection,
  SnapshotSkeleton,
} from "@/components/analytics/snapshot-section";
import {
  AnalyticsPostsSkeleton,
  GrowthGraphSkeleton,
} from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { getAnalyticsSnapshotServer } from "@/lib/server-analytics-snapshot";
import { getBillingMeServer } from "@/lib/server-billing";
import { getFollowerGrowthServer } from "@/lib/server-follower-growth";
import { getInstagramPostsServer } from "@/lib/server-instagram-posts";

export default function AnalyticsPage() {
  return (
    <div className="w-full">
      <section className="mb-4">
        <RetryBoundary description="We couldn't load your analytics. Please try again.">
          <Suspense fallback={<SnapshotSkeleton />}>
            <SnapshotContent />
          </Suspense>
        </RetryBoundary>
      </section>

      <RetryBoundary description="We couldn't load your growth data. Please try again.">
        <Suspense fallback={<GrowthGraphSkeleton />}>
          <GrowthContent />
        </Suspense>
      </RetryBoundary>

      <RetryBoundary description="We couldn't load your posts. Please try again.">
        <Suspense fallback={<AnalyticsPostsSkeleton />}>
          <PostsContent />
        </Suspense>
      </RetryBoundary>
    </div>
  );
}

// An unreachable api throws into the retry boundary rather than reading as
// "not connected", which would wrongly offer to connect again.
async function SnapshotContent() {
  const response = await getAnalyticsSnapshotServer();

  if (!response) {
    throw new Error("Analytics snapshot unavailable");
  }

  return <SnapshotSection response={response} />;
}

// Billing unreachable reads as Free's windows: it can only show less.
async function GrowthContent() {
  const [billing, growth] = await Promise.all([
    getBillingMeServer(),
    getFollowerGrowthServer(),
  ]);

  return (
    <GrowthSection
      allowedWindows={billing?.entitlements.analyticsWindowsDays ?? [7, 30]}
      growth={growth}
    />
  );
}

async function PostsContent() {
  return <PostsSection posts={await getInstagramPostsServer()} />;
}
