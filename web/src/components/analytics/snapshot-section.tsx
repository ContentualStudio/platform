import {
  BarChart3,
  Eye,
  RefreshCw,
  ThumbsUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnalyticsMessage } from "@/components/analytics/analytics-message";
import { ConnectInstagramCard } from "@/components/analytics/connect-instagram-card";
import { KpiCard } from "@/components/analytics/kpi-card";
import { SyncRefresher } from "@/components/analytics/sync-refresher";
import { Spinner } from "@/components/ui/spinner";
import { snapshotKpis, type SnapshotKpiId } from "@/components/analytics/data";
import type { AnalyticsSnapshotResponse } from "@/lib/analytics-snapshot";

const KPI_ICONS: Record<
  SnapshotKpiId,
  { icon: LucideIcon; iconClassName: string }
> = {
  views: { icon: Eye, iconClassName: "text-accent" },
  profileVisits: { icon: UserRound, iconClassName: "text-tint-red" },
  engagementRate: { icon: ThumbsUp, iconClassName: "text-tint-blue" },
  followers: { icon: Users, iconClassName: "text-success" },
};

/** "8 Oct" from a "2026-10-08" local date, read as the calendar day it names. */
function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T00:00:00Z`));
}

/**
 * The four snapshot tiles, or the state in their place: not connected, or
 * connected but the first daily pull has not landed yet.
 */
export function SnapshotSection({
  response,
}: {
  response: AnalyticsSnapshotResponse;
}) {
  if (!response.connected) {
    return <ConnectInstagramCard />;
  }

  if (!response.snapshot) {
    return response.syncing ? (
      <>
        <SyncRefresher />
        <AnalyticsMessage
          description="We're bringing in your posts and insights now. This page updates on its own in a moment."
          icon={RefreshCw}
          role="status"
          title="Pulling your Instagram data"
        />
      </>
    ) : (
      <AnalyticsMessage
        description="Your Instagram is connected. Your first numbers arrive with the next daily update."
        icon={BarChart3}
        role="status"
        title="Collecting your insights"
      />
    );
  }

  const { latestDay } = response.snapshot;

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {snapshotKpis(response.snapshot).map((kpi) => {
          const glyph = KPI_ICONS[kpi.id];

          return (
            <KpiCard
              changePercent={kpi.changePercent}
              icon={glyph.icon}
              iconClassName={glyph.iconClassName}
              key={kpi.id}
              title={kpi.title}
              value={kpi.value}
            />
          );
        })}
      </div>
      {response.syncing ? (
        <p
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <SyncRefresher />
          <Spinner className="size-3.5" />
          Pulling your Instagram posts and insights - this page updates on its
          own in a moment.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {latestDay
            ? `Views, profile visits and engagement are for ${formatLocalDate(latestDay.localDate)}, the latest day Instagram reported.`
            : "Views, profile visits and engagement arrive with the next daily update."}
        </p>
      )}
    </div>
  );
}

/** Four tiles plus the caption line, at the real section's height. */
export function SnapshotSkeleton() {
  return (
    <div aria-hidden data-skeleton>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {["views", "visits", "rate", "followers"].map((tile) => (
          <div className="h-40 animate-pulse rounded-2xl bg-foreground/5" key={tile} />
        ))}
      </div>
      <div className="mt-3 h-5 w-80 max-w-full rounded-lg bg-foreground/5" />
    </div>
  );
}
