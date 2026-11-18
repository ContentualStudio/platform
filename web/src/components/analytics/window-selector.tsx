import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowthWindow } from "@/components/analytics/data";

const ALL_WINDOWS: { value: GrowthWindow; label: string }[] = [
  { value: 7, label: "7 Days" },
  { value: 30, label: "30 Days" },
  { value: 90, label: "90 Days" },
];

/** Growth window pills; out-of-plan windows stay selectable with a lock. */
export function WindowSelector({
  value,
  allowed,
  onChange,
}: {
  value: GrowthWindow;
  allowed: readonly number[];
  onChange: (next: GrowthWindow) => void;
}) {

  return (
    <div className="flex gap-2" role="group" aria-label="Growth window">
      {ALL_WINDOWS.map((option) => {
        const permitted = allowed.includes(option.value);
        const active = option.value === value;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "bg-accent text-accent-foreground"
                : "bg-background text-muted-foreground hover:bg-control-hover",
              !permitted && !active && "opacity-60",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={permitted ? undefined : "Available on the Creator plan"}
            type="button"
          >
            {permitted ? null : <Lock aria-hidden className="size-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
