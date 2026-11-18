import { z } from "zod";
import type { GrowthPoint, GrowthWindow } from "@/components/analytics/data";
import { formatUtcDay, MS_PER_DAY, parseDateKey } from "./challenge-progress";

export const followerGrowthResponseSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(false) }).strict(),
  z
    .object({
      connected: z.literal(true),
      today: z.iso.date(),
      points: z.array(
        z
          .object({
            date: z.iso.date(),
            followers: z.number().int().nonnegative(),
          })
          .strict(),
      ),
    })
    .strict(),
]);

export type FollowerGrowthResponse = z.infer<typeof followerGrowthResponseSchema>;

export type ConnectedFollowerGrowth = Extract<
  FollowerGrowthResponse,
  { connected: true }
>;

/**
 * The snapshots inside a window ending on the user's local today — `window`
 * days including today — as chart points, oldest first.
 */
export function growthWindowPoints(
  growth: ConnectedFollowerGrowth,
  window: GrowthWindow,
): GrowthPoint[] {
  const [start] = growthWindowRange(growth.today, window);

  return growth.points
    .map((point) => ({ date: parseDateKey(point.date), value: point.followers }))
    .filter((point) => point.date.getTime() >= start)
    .map((point) => ({
      time: point.date.getTime(),
      day: formatUtcDay(point.date),
      value: point.value,
    }));
}

/**
 * The window's first and last day (today) as UTC midnights, in ms. The chart
 * spans the whole window whatever was recorded, so a short history reads as
 * where it is in time — a first day sits at the right edge, not the middle.
 */
export function growthWindowRange(
  today: string,
  window: GrowthWindow,
): [number, number] {
  const end = parseDateKey(today).getTime();

  return [end - (window - 1) * MS_PER_DAY, end];
}

/**
 * Evenly spaced axis ticks counted back from today, so the last tick is
 * always today: every day for 7, weekly for 30, monthly-ish for 90.
 */
export function growthWindowTicks(today: string, window: GrowthWindow): number[] {
  const [start, end] = growthWindowRange(today, window);
  const step = (window === 7 ? 1 : window === 30 ? 7 : 15) * MS_PER_DAY;
  const ticks: number[] = [];

  for (let tick = end; tick >= start; tick -= step) {
    ticks.unshift(tick);
  }

  return ticks;
}

export interface GrowthChange {
  change: number;
  percent: number;
}

/** Latest in-window value minus the earliest; a single point is no change. */
export function growthChange(points: readonly GrowthPoint[]): GrowthChange {
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const change = last - first;

  return { change, percent: first ? (change / first) * 100 : 0 };
}

const Y_INTERVALS = 3;

/** The smallest 1, 2 or 5 × 10ⁿ step that is at least `rough`. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= rough) ?? 10;
  return step * magnitude;
}

/**
 * Round follower-axis ticks padded around the data rather than pinned to
 * zero, so a change of a few followers shows as a slope and a flat or
 * single-day history sits mid-chart instead of on a gridline.
 */
export function followerTicks(values: readonly number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(2, (max - min) * 0.2, max * 0.02);
  let step = niceStep(Math.max(1, (max - min + 2 * pad) / Y_INTERVALS));
  let low = Math.max(0, Math.floor((min - pad) / step) * step);

  while (low + step * Y_INTERVALS < max + pad / 2) {
    step = niceStep(step * 1.5);
    low = Math.max(0, Math.floor((min - pad) / step) * step);
  }

  return Array.from({ length: Y_INTERVALS + 1 }, (_, i) => low + i * step);
}
