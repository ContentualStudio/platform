// Shared types and formatting for the Analytics UI. The data itself is live —
// see lib/analytics-snapshot.ts, lib/follower-growth.ts and lib/instagram-posts.ts.

import type { AnalyticsSnapshot } from "@/lib/analytics-snapshot";

export type GrowthWindow = 7 | 30 | 90;

export interface GrowthPoint {
  /** The day's UTC midnight, in ms — the chart's time axis. */
  time: number;
  day: string;
  value: number;
}

/** Default to 30d when permitted, else the longest permitted window. */
export function defaultWindowFor(allowed: readonly number[]): GrowthWindow {
  if (allowed.includes(30)) {
    return 30;
  }

  const longest = Math.max(...allowed);

  return longest === 7 || longest === 90 ? longest : 30;
}

// ── Number formatting ───────────────────────────────────────────────

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Signed percent for KPI deltas, e.g. "+15.3%" / "-8.2%". */
export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Period-over-period change as a percent of the previous value. `null` when
 * there is no previous baseline to divide by.
 */
export function periodChangePercent(
  delta: number,
  current: number,
): number | null {
  const previous = current - delta;
  if (previous === 0) {
    return null;
  }
  return (delta / previous) * 100;
}

export type SnapshotKpiId =
  | "views"
  | "profileVisits"
  | "engagementRate"
  | "followers";

export interface SnapshotKpi {
  id: SnapshotKpiId;
  title: string;
  value: string;
  changePercent: number | null;
}

const UNREPORTED = "-";

/**
 * Interactions as a percent of accounts reached, the latest day. `null` when
 * either is unreported or nobody was reached — there is no rate to show.
 */
export function engagementRate(
  interactions: number | null,
  reach: number | null,
): number | null {
  if (interactions === null || reach === null || reach === 0) {
    return null;
  }

  return (interactions / reach) * 100;
}

/**
 * Four snapshot tiles, in the design's left-to-right order. Views (Instagram's
 * successor to impressions), profile visits and engagement are the latest day
 * Instagram reported; followers is the current count with its week change.
 */
export function snapshotKpis(snapshot: AnalyticsSnapshot): SnapshotKpi[] {
  const day = snapshot.latestDay;
  const rate = engagementRate(day?.interactions ?? null, day?.reach ?? null);

  return [
    {
      id: "views",
      title: "Views",
      value: day?.views == null ? UNREPORTED : formatCompact(day.views),
      changePercent: null,
    },
    {
      id: "profileVisits",
      title: "Profile Visits",
      value:
        day?.profileViews == null ? UNREPORTED : formatCompact(day.profileViews),
      changePercent: null,
    },
    {
      id: "engagementRate",
      title: "Engagement Rate",
      value: rate === null ? UNREPORTED : formatPercent(rate),
      changePercent: null,
    },
    {
      id: "followers",
      title: "Followers",
      value: formatCompact(snapshot.followers),
      changePercent:
        snapshot.followerDeltaWeek === null
          ? null
          : periodChangePercent(snapshot.followerDeltaWeek, snapshot.followers),
    },
  ];
}

export function growthSummaryLabel(
  change: number,
  percent: number,
  windowSize: GrowthWindow,
): string {
  if (change === 0) {
    return `No change in the last ${windowSize} days`;
  }

  const signedCount = `${change > 0 ? "+" : ""}${formatCount(change)}`;
  return `${signedCount} followers in the last ${windowSize} days (${formatSignedPercent(percent)})`;
}

export type Trend = "up" | "down" | "flat";

export function trendOf(delta: number): Trend {
  if (delta > 0) {
    return "up";
  }
  if (delta < 0) {
    return "down";
  }
  return "flat";
}
