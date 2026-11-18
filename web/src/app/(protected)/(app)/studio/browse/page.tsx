import { Suspense } from "react";
import { StudioBrowseSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { StudioBrowse } from "@/components/studio/studio-browse";
import { loadStudioRouteContext } from "@/lib/studio-route-context";

export default function StudioBrowsePage({
  searchParams,
}: PageProps<"/studio/browse">) {
  return (
    <RetryBoundary description="We couldn't load the library. Please try again.">
      <Suspense fallback={<StudioBrowseSkeleton />}>
        <StudioBrowseContent searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function StudioBrowseContent({
  searchParams,
}: {
  searchParams: PageProps<"/studio/browse">["searchParams"];
}) {
  const { initialLessonId, lessons, platformLabel, relatedLessonIds } =
    await loadStudioRouteContext(searchParams);

  return (
    <StudioBrowse
      key={JSON.stringify(relatedLessonIds)}
      initialLessonId={initialLessonId}
      relatedLessonIds={relatedLessonIds}
      lessons={lessons}
      platformLabel={platformLabel}
    />
  );
}
