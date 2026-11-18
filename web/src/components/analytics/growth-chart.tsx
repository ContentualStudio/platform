"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  formatCompact,
  formatCount,
  type GrowthPoint,
  type GrowthWindow,
} from "@/components/analytics/data";
import { formatUtcDay } from "@/lib/challenge-progress";
import {
  followerTicks,
  growthWindowRange,
  growthWindowTicks,
} from "@/lib/follower-growth";

const chartConfig = {
  value: { label: "Followers", color: "var(--ds-accent)" },
} satisfies ChartConfig;

const GRADIENT_ID = "growth-fill";

// Hoisted so it isn't redefined as a nested component on every render.
function formatFollowersTooltip(value: unknown) {
  return (
    <span className="font-mono font-medium tabular-nums text-foreground">
      {formatCount(Number(value))} followers
    </span>
  );
}

function formatTooltipDay(_label: unknown, payload: readonly { payload?: unknown }[]) {
  const point = payload[0]?.payload as GrowthPoint | undefined;
  return point?.day ?? "";
}

const formatTick = (time: number) => formatUtcDay(new Date(time));

/**
 * Follower area chart over the whole window on a real time axis: days with
 * no reading are gaps in time, not squeezed out, so a new connection's first
 * days sit at the right edge, ending today. Recharts' accessibilityLayer gives
 * keyboard navigation of points; the tooltip exposes date + follower count for
 * both pointer and keyboard.
 */
// Axis labels stay quieter than the data: a fixed 10px rather than whatever
// the container's text size happens to be.
const AXIS_TICK = { fontSize: 10 } as const;

export function GrowthChart({
  data,
  today,
  window,
}: {
  data: GrowthPoint[];
  today: string;
  window: GrowthWindow;
}) {
  const yTicks = followerTicks(data.length ? data.map((p) => p.value) : [0]);

  return (
    <ChartContainer className="aspect-auto h-[260px] w-full" config={chartConfig}>
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 16, top: 12, bottom: 4 }}
      >
        <defs>
          <linearGradient id={GRADIENT_ID} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="time"
          domain={growthWindowRange(today, window)}
          scale="time"
          tick={AXIS_TICK}
          tickFormatter={formatTick}
          tickLine={false}
          tickMargin={8}
          ticks={growthWindowTicks(today, window)}
          type="number"
        />
        <YAxis
          axisLine={false}
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          tick={AXIS_TICK}
          ticks={yTicks}
          tickFormatter={(value: number) => formatCompact(value)}
          tickLine={false}
          tickMargin={8}
          width={44}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={formatFollowersTooltip}
              labelFormatter={formatTooltipDay}
            />
          }
        />
        <Area
          activeDot={{ r: 5 }}
          dataKey="value"
          dot={data.length < 15 ? { fill: "var(--color-value)", r: 4, strokeWidth: 0 } : false}
          fill={`url(#${GRADIENT_ID})`}
          stroke="var(--color-value)"
          strokeWidth={2.5}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
