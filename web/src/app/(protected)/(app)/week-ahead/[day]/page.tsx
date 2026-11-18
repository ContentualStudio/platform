import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { UpcomingTaskPreview } from "@/components/week-ahead/upcoming-task-preview";
import { getUpcomingTaskPreviewServer } from "@/lib/server-week-ahead";

export default function UpcomingDayPage({
  params,
}: PageProps<"/week-ahead/[day]">) {
  return (
    <RetryBoundary description="We couldn't load this upcoming task. Please try again.">
      <Suspense fallback={<PageSkeleton />}>
        <UpcomingDayContent params={params} />
      </Suspense>
    </RetryBoundary>
  );
}

async function UpcomingDayContent({
  params,
}: {
  params: PageProps<"/week-ahead/[day]">["params"];
}) {
  const { day } = await params;
  const dayNumber = Number(day);

  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    notFound();
  }

  // A past day, a day past the end of the programme, and a gap day all resolve
  // to null — none of them is a page the week-ahead view can reach.
  const task = await getUpcomingTaskPreviewServer(dayNumber);

  if (!task) {
    notFound();
  }

  return <UpcomingTaskPreview dayNumber={dayNumber} task={task} />;
}
