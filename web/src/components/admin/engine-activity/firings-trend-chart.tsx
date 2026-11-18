"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDay } from "@/lib/admin/admin-format";
import type { DailyFirings } from "@/lib/admin/admin-engine-activity";

const chartConfig = {
  firings: { label: "Firings", color: "var(--ds-accent)" },
} satisfies ChartConfig;

const AXIS_TICK = { fontSize: 10 } as const;

// "14 Oct": the year is noise on a 30-day axis.
const formatTick = (day: string) => formatDay(day).replace(/ \d{4}$/, "");

function formatTooltipDay(_label: unknown, payload: readonly { payload?: unknown }[]) {
  const point = payload[0]?.payload as DailyFirings[number] | undefined;
  return point ? formatDay(point.day) : "";
}

/** Firings per UTC day over the trend window; a quiet day is a zero bar. */
export function FiringsTrendChart({ data }: { data: DailyFirings }) {
  return (
    <ChartContainer className="aspect-auto h-44 w-full" config={chartConfig}>
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="day"
          interval="preserveStartEnd"
          minTickGap={24}
          tick={AXIS_TICK}
          tickFormatter={formatTick}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickLine={false}
          tickMargin={8}
          width={32}
        />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatTooltipDay} />}
          cursor={false}
        />
        <Bar dataKey="firings" fill="var(--color-firings)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}
