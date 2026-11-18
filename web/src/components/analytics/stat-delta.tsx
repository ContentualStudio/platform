import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { trendOf, type Trend } from "@/components/analytics/data";

const TREND_ICON: Record<Trend, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

const TREND_CLASS: Record<Trend, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

/**
 * Trend indicator. The arrow direction and colour are backed by the text
 * label, so meaning never relies on colour/shape alone.
 */
export function StatDelta({
  delta,
  label,
  className,
}: {
  delta: number;
  label: string;
  className?: string;
}) {
  const trend = trendOf(delta);
  const Icon = TREND_ICON[trend];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-base font-semibold",
        TREND_CLASS[trend],
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  );
}
