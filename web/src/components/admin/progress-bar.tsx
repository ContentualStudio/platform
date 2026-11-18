/**
 * A 0–100 bar with its percentage beside it, used wherever the admin shows
 * how far someone got. The printed percentage carries the value; the bar is
 * the glance.
 *
 * The fill is accent-text, not accent: the bright orange is 2.3:1 against the
 * light track, under the 3:1 a bar needs; the darker step is 3.7:1 (and the
 * plain accent in dark mode, 3.8:1).
 */
export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const percent = value === null ? null : Math.round(value);

  return (
    <div className="flex items-center gap-3">
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? 0}
        className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/15"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-accent-text" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-foreground">
        {percent === null ? "—" : `${percent}%`}
      </span>
    </div>
  );
}
