import type { LucideIcon } from "lucide-react";
import { formatSignedPercent } from "@/components/analytics/data";
import { StatDelta } from "@/components/analytics/stat-delta";
import { cn } from "@/lib/utils";

export function KpiCard({
  title,
  value,
  changePercent,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  value: string;
  changePercent: number | null;
  icon: LucideIcon;
  iconClassName: string;
}) {
  return (
    <article className="flex flex-col justify-center gap-2 rounded-2xl bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-foreground-soft">{title}</h3>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
          <Icon aria-hidden className={cn("size-6", iconClassName)} />
        </span>
      </div>
      <p className="text-4xl font-bold leading-none text-foreground">{value}</p>
      {changePercent !== null ? (
        <StatDelta
          className="text-sm font-medium"
          delta={changePercent}
          label={formatSignedPercent(changePercent)}
        />
      ) : null}
    </article>
  );
}
