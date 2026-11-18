"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart as LineChartIcon } from "lucide-react";
import { ConnectInstagramCard } from "@/components/analytics/connect-instagram-card";
import { GatedOverlay } from "@/components/analytics/gated-overlay";
import { GrowthChart } from "@/components/analytics/growth-chart";
import { StatDelta } from "@/components/analytics/stat-delta";
import { WindowSelector } from "@/components/analytics/window-selector";
import {
  defaultWindowFor,
  growthSummaryLabel,
  type GrowthWindow,
} from "@/components/analytics/data";
import {
  growthChange,
  growthWindowPoints,
  type ConnectedFollowerGrowth,
  type FollowerGrowthResponse,
} from "@/lib/follower-growth";

// Below this many points the chart still renders, with a note that it fills
// out over time.
const FULL_HISTORY_POINTS = 3;

export function GrowthSection({
  allowedWindows,
  growth,
}: {
  allowedWindows: readonly number[];
  growth: FollowerGrowthResponse;
}) {
  const router = useRouter();

  return (
    <section aria-label="Growth Graph" className="mb-16">
      {growth.connected ? (
        <GrowthGraph
          allowedWindows={allowedWindows}
          growth={growth}
          onUpgrade={() => router.push("/settings/account")}
        />
      ) : (
        <ConnectInstagramCard
          description="Your growth graph starts the day you connect Instagram and builds from there as you post."
          title="No growth data yet"
        />
      )}
    </section>
  );
}

function GrowthGraph({
  allowedWindows,
  growth,
  onUpgrade,
}: {
  allowedWindows: readonly number[];
  growth: ConnectedFollowerGrowth;
  onUpgrade: () => void;
}) {
  const [windowSize, setWindowSize] = useState<GrowthWindow>(() =>
    defaultWindowFor(allowedWindows),
  );

  // An out-of-plan window stays selectable and renders blurred behind the
  // upgrade prompt.
  const gated = !allowedWindows.includes(windowSize);
  const points = growthWindowPoints(growth, windowSize);
  const { change, percent } = growthChange(points);

  return (
    <div className="rounded-3xl bg-surface p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Growth Graph
          </h3>
          {gated ? (
            <span className="text-sm text-muted">
              {windowSize}-day history is on the Creator plan
            </span>
          ) : points.length > 0 ? (
            <StatDelta
              className="text-sm"
              delta={change}
              label={growthSummaryLabel(change, percent, windowSize)}
            />
          ) : null}
        </div>
        <WindowSelector
          allowed={allowedWindows}
          onChange={setWindowSize}
          value={windowSize}
        />
      </div>

      {gated ? (
        <GatedOverlay
          label={`Unlock ${windowSize}-day analytics`}
          onUpgrade={onUpgrade}
        >
          <GrowthChart data={points} today={growth.today} window={windowSize} />
        </GatedOverlay>
      ) : points.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <LineChartIcon aria-hidden className="size-10 text-muted opacity-40" />
          <div>
            <p className="text-base font-bold text-foreground">No history yet</p>
            <p className="text-sm text-muted-foreground">
              We record your follower count once a day, starting from the day
              you connected. Your first point appears after the next update.
            </p>
          </div>
        </div>
      ) : (
        <>
          <GrowthChart data={points} today={growth.today} window={windowSize} />
          {points.length < FULL_HISTORY_POINTS ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Your graph fills out as more days are recorded.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
